import { pipeline } from '@huggingface/transformers';

/**
 * Speech recognition, in two engines.
 *
 *   offline — Moonshine, ONNX in this process. Small, fast on CPU, no network.
 *   online  — Parakeet TDT 0.6B, through NVIDIA's hosted ASR endpoint.
 *
 * A note on why the online path is remote: transformers.js ships
 * `ParakeetForCTC`, and Parakeet *TDT* uses a Token-and-Duration Transducer
 * decoder, which it does not implement. The TDT weights therefore cannot run
 * locally through this stack — the hosted endpoint is the only way to get the
 * model that was actually asked for. If offline Parakeet matters more than
 * TDT specifically, the CTC variant would run here alongside Moonshine.
 *
 * Both engines take the same input: 16 kHz mono float PCM. The client
 * resamples before sending, so the server needs no audio codec at all.
 */

export const SAMPLE_RATE = 16_000;

export type SttEngine = 'moonshine' | 'parakeet';

/* ─── OFFLINE: MOONSHINE ──────────────────────────────────────────── */

const MOONSHINE_MODEL = process.env.MOONSHINE_MODEL ?? 'onnx-community/moonshine-base-ONNX';

let moonshine: Promise<any> | null = null;

function moonshineEngine(): Promise<any> {
  if (!moonshine) {
    moonshine = pipeline('automatic-speech-recognition', MOONSHINE_MODEL, {
      dtype: (process.env.MOONSHINE_DTYPE ?? 'q8') as any,
      device: 'cpu',
    }).catch((e) => {
      moonshine = null;
      throw e;
    });
  }
  return moonshine;
}

async function transcribeMoonshine(pcm: Float32Array): Promise<string> {
  const asr = await moonshineEngine();
  const out = await asr(pcm);
  return String(Array.isArray(out) ? out[0]?.text ?? '' : out?.text ?? '').trim();
}

/* ─── ONLINE: PARAKEET TDT 0.6B ───────────────────────────────────── */

const NVIDIA_ASR_URL =
  process.env.NVIDIA_ASR_URL ??
  'https://integrate.api.nvidia.com/v1/audio/transcriptions';

const PARAKEET_MODEL = process.env.PARAKEET_MODEL ?? 'nvidia/parakeet-tdt-0.6b-v2';

/** Minimal WAV container so the endpoint gets a file it can read. */
function toWav(pcm: Float32Array, rate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  const bytes = pcm.length * 2;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);       // PCM chunk size
  header.writeUInt16LE(1, 20);        // format: PCM
  header.writeUInt16LE(1, 22);        // channels: mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);        // block align
  header.writeUInt16LE(16, 34);       // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(bytes, 40);

  const body = Buffer.alloc(bytes);
  for (let i = 0; i < pcm.length; i++) {
    // Clamp before scaling: values outside [-1, 1] wrap and produce clicks.
    const s = Math.max(-1, Math.min(1, pcm[i]));
    body.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return Buffer.concat([header, body]);
}

async function transcribeParakeet(pcm: Float32Array, signal?: AbortSignal): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error(
      'Online speech recognition needs NVIDIA_API_KEY. Set it, or switch to offline mode to use Moonshine.'
    );
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(toWav(pcm))], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', PARAKEET_MODEL);
  form.append('language', 'en');

  const r = await fetch(NVIDIA_ASR_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal,
  });

  if (!r.ok) {
    throw new Error(`Parakeet returned ${r.status}: ${await r.text().catch(() => '')}`.trim());
  }

  const j: any = await r.json();
  return String(j.text ?? j.transcript ?? '').trim();
}

/* ─── ENTRY ───────────────────────────────────────────────────────── */

/**
 * Transcribe one chunk of speech.
 *
 * Falls back to Moonshine when the online engine cannot run, because a local
 * transcript is better than an error — the user still gets their words.
 */
export async function transcribe(
  pcm: Float32Array,
  engine: SttEngine,
  signal?: AbortSignal
): Promise<{ text: string; engine: SttEngine; fellBack?: string }> {
  if (engine === 'parakeet') {
    try {
      return { text: await transcribeParakeet(pcm, signal), engine: 'parakeet' };
    } catch (e) {
      const why = (e as Error).message;
      const text = await transcribeMoonshine(pcm);
      return { text, engine: 'moonshine', fellBack: why };
    }
  }
  return { text: await transcribeMoonshine(pcm), engine: 'moonshine' };
}

export const sttReady = () => moonshine !== null;

/** Load Moonshine ahead of first use. Never throws. */
export async function warmStt(): Promise<boolean> {
  try {
    await moonshineEngine();
    return true;
  } catch {
    return false;
  }
}
