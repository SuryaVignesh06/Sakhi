import { KokoroTTS } from 'kokoro-js';

/**
 * Kokoro-82M speech synthesis, in-process.
 *
 * Runs the ONNX weights through onnxruntime-node rather than shelling out to
 * Python, so there is no sidecar to supervise and no second runtime to
 * install. The same engine serves online and offline mode — TTS never needed
 * the network, so there was never a reason to have two of them.
 *
 * The model is ~80–160MB depending on quantisation and is fetched from the
 * Hugging Face cache on first use. That download is the one slow moment;
 * `warm()` exists so it happens before a user is waiting on speech.
 */

const MODEL = process.env.KOKORO_MODEL ?? 'onnx-community/Kokoro-82M-v1.0-ONNX';

/**
 * q8 is the accuracy/speed trade that keeps synthesis comfortably faster than
 * real time on CPU. Override with KOKORO_DTYPE=fp32 for maximum fidelity on a
 * machine that can afford it.
 */
const DTYPE = (process.env.KOKORO_DTYPE ?? 'q8') as 'fp32' | 'fp16' | 'q8' | 'q4';

/**
 * Long replies are the slow case: synthesis time scales with text, so a
 * paragraph takes several seconds before ANY audio plays. Speaking only the
 * opening sentences keeps the response immediate — the full text is on screen
 * regardless, and a voice assistant reading four paragraphs aloud is not what
 * anyone wants anyway.
 */
const SPEAK_LIMIT = Number(process.env.KOKORO_SPEAK_LIMIT ?? 320);

function trimForSpeech(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= SPEAK_LIMIT) return clean;
  // Cut at the last sentence end inside the budget, so it never stops mid-word.
  const head = clean.slice(0, SPEAK_LIMIT);
  const cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  return cut > 80 ? head.slice(0, cut + 1) : head + '…';
}

export const DEFAULT_VOICE = process.env.KOKORO_VOICE ?? 'af_heart';

let loading: Promise<KokoroTTS> | null = null;

/**
 * One shared instance, loaded at most once.
 *
 * The promise itself is cached, not just the result — two requests arriving
 * during the first load must await the same download rather than starting a
 * second one.
 */
function engine(): Promise<KokoroTTS> {
  if (!loading) {
    loading = KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' }).catch((e) => {
      // Let the next call retry instead of caching a permanent failure.
      loading = null;
      throw e;
    });
  }
  return loading;
}

export const ttsReady = () => loading !== null;

/** Load the weights ahead of first use. Never throws. */
export async function warmTts(): Promise<boolean> {
  try {
    await engine();
    return true;
  } catch {
    return false;
  }
}

export interface SpeakOptions {
  voice?: string;
  /** 1 is natural pace; the model accepts a multiplier either side of it. */
  speed?: number;
}

/** Synthesises `text` and returns a WAV buffer. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<Buffer> {
  const tts = await engine();
  const audio = await tts.generate(trimForSpeech(text), {
    voice: (opts.voice ?? DEFAULT_VOICE) as any,
    speed: opts.speed ?? 1,
  });
  return Buffer.from(audio.toWav());
}

/** Voice ids this build can speak with, for the settings UI. */
export async function voices(): Promise<string[]> {
  try {
    const tts = await engine();
    return Object.keys((tts as any).voices ?? {});
  } catch {
    return [];
  }
}
