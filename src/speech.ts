import { API_BASE } from './api';

/**
 * Speech in and out, against the backend's ONNX engines.
 *
 * The wire format is deliberately dumb: 16 kHz mono float PCM, raw, no
 * container. The Web Audio graph already holds samples in exactly that shape,
 * so nothing has to encode on the way out or decode on the way in — which is
 * what keeps ffmpeg out of the server.
 */

export const SAMPLE_RATE = 16_000;

export type SttEngine = 'moonshine' | 'parakeet';

export interface Transcript {
  text: string;
  engine: SttEngine;
  /** Set when the online engine failed and Moonshine answered instead. */
  fellBack?: string;
}

/* ─── RECORDING ───────────────────────────────────────────────────── */

/**
 * Captures microphone audio as 16 kHz mono float PCM.
 *
 * An OfflineAudioContext would be the tidy way to resample, but it cannot run
 * on a live stream. Instead the graph is opened AT 16 kHz — browsers resample
 * the device input to the context rate for us, in native code, which is both
 * correct and free.
 */
export class PcmRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const src = this.ctx.createMediaStreamSource(this.stream);

    /* ScriptProcessor is deprecated in favour of AudioWorklet, but a worklet
       needs a separately served module file; for a mono 16k capture the
       difference is not audible and this keeps the build a single bundle. */
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      // The buffer is reused between callbacks, so it must be copied.
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    src.connect(this.node);
    // Destination connection is required for the processor to be pulled, but
    // a zero gain keeps the user from hearing themselves.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute);
    mute.connect(this.ctx.destination);
  }

  /** Everything captured so far, without stopping. */
  peek(): Float32Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }

  /** Hands back everything captured and clears the buffer. */
  drain(): Float32Array {
    const out = this.peek();
    this.chunks = [];
    return out;
  }

  /**
   * Drop everything except the most recent `keep` samples.
   *
   * Lets a sliding-window consumer bound memory while still leaving the
   * overlap in place for the next pass — `drain` would throw away the very
   * audio that makes overlapping windows work.
   */
  trimTo(keep: number): void {
    const all = this.peek();
    this.chunks = all.length > keep ? [all.slice(-keep)] : [all];
  }

  stop(): Float32Array {
    const out = this.peek();
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.chunks = [];
    return out;
  }

  get active() {
    return this.ctx !== null;
  }
}

/* ─── RECOGNITION ─────────────────────────────────────────────────── */

/** Rough loudness gate: silence is not worth a round trip to a model. */
function hasSpeech(pcm: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, pcm.length)) > 0.005;
}

export async function transcribe(
  pcm: Float32Array,
  engine: SttEngine,
  signal?: AbortSignal
): Promise<Transcript | null> {
  if (pcm.length < SAMPLE_RATE * 0.25 || !hasSpeech(pcm)) return null;

  const r = await fetch(`${API_BASE}/api/stt?engine=${engine}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    // A copy, because the view may not span its whole backing buffer.
    body: pcm.slice().buffer,
    signal,
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `Transcription failed (${r.status}).`);
  }
  return r.json();
}

/* ─── SYNTHESIS ───────────────────────────────────────────────────── */

let current: HTMLAudioElement | null = null;

/** Stops whatever is being spoken right now. */
export function stopSpeaking() {
  if (!current) return;
  current.pause();
  URL.revokeObjectURL(current.src);
  current = null;
}

/**
 * Speaks `text` through Kokoro and resolves when playback ends.
 *
 * Only one utterance plays at a time — starting a new one cuts the old one
 * off, which is what makes barge-in work.
 */
export async function speak(text: string, opts: { voice?: string; speed?: number } = {}): Promise<void> {
  stopSpeaking();
  if (!text.trim()) return;

  const r = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...opts }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `Speech synthesis failed (${r.status}).`);
  }

  const url = URL.createObjectURL(await r.blob());
  const el = new Audio(url);
  current = el;

  await new Promise<void>((resolve) => {
    const done = () => {
      if (current === el) {
        URL.revokeObjectURL(url);
        current = null;
      }
      resolve();
    };
    el.onended = done;
    el.onerror = done;
    void el.play().catch(done);
  });
}

/* ─── STATUS / WARM-UP ────────────────────────────────────────────── */

export interface SpeechStatus {
  tts: { engine: string; loaded: boolean; voices: string[] };
  stt: {
    offline: { engine: string; loaded: boolean };
    online: { engine: string; configured: boolean };
  };
}

export async function speechStatus(): Promise<SpeechStatus | null> {
  try {
    const r = await fetch(`${API_BASE}/api/speech/status`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Pull the weights into memory before anyone is waiting on them. */
export async function preloadSpeech(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/speech/preload`, { method: 'POST' });
  } catch {
    /* Backend down — the first utterance will just be slower. */
  }
}
