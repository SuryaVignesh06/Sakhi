import { useCallback, useEffect, useRef, useState } from 'react';
import { PcmRecorder, SAMPLE_RATE, transcribe, type SttEngine } from './speech';

/**
 * Dictation into the composer.
 *
 * NOT the same thing as useVoiceCall. That hook runs a hands-free
 * conversation: it hears an utterance, sends it, and speaks the reply. This
 * one only transcribes — the text lands in the input box and the user decides
 * when to send it, so they can edit it, add to it by typing, or throw it away.
 *
 * ── Why this no longer uses the Web Speech API ──────────────────────
 *
 * It used to, and that is exactly why the microphone button did nothing at
 * all: `webkitSpeechRecognition` is a Chrome-proprietary feature backed by
 * Google's speech servers, and Electron does not ship it. So
 * `window.SpeechRecognition` is undefined in this app, `supported` was false,
 * and every click fell straight into the "not supported" branch and returned
 * without ever opening the microphone.
 *
 * Both paths now run on our own models through the backend — Parakeet when
 * online, Moonshine when offline — which also means offline mode never sends
 * audio to a cloud service.
 *
 * The trade-off: a chunk model has no interim results, so rather than
 * streaming words as they form, a phrase lands when a silence boundary closes
 * it. The microphone stays open across phrases, so dictation is continuous.
 */

export type DictationError =
  | { kind: 'denied'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'interrupted'; message: string };

interface Options {
  /** A phrase settled — insert it into the input. */
  onFinal: (text: string) => void;
  /** Offline keeps recognition on Moonshine; online reaches for Parakeet. */
  offline?: boolean;
}

/** Silence this long and we hint that we are still listening. */
const SILENCE_HINT_MS = 4000;
/** Below this RMS the room counts as quiet. */
const SILENCE_RMS = 0.012;
/** Quiet for this long after speech closes the phrase. */
const PHRASE_GAP_MS = 800;
/** Ignore blips shorter than this — a cough is not a sentence. */
const MIN_SPEECH_MS = 300;
/** How often loudness is sampled. */
const STEP_MS = 100;

export function useDictation({ onFinal, offline = false }: Options) {
  const [recording, setRecording] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<DictationError | null>(null);
  const [silent, setSilent] = useState(false);

  const rec = useRef<PcmRecorder | null>(null);
  const tick = useRef<number | null>(null);
  const hintTimer = useRef<number | null>(null);
  const busy = useRef(false);
  const speechMs = useRef(0);
  const quietMs = useRef(0);

  /* onFinal changes identity every render in most callers; a ref keeps the
     polling loop stable so it is never torn down mid-phrase. */
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const engineRef = useRef<SttEngine>('moonshine');
  engineRef.current = offline ? 'moonshine' : 'parakeet';

  const armHint = useCallback(() => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    setSilent(false);
    hintTimer.current = window.setTimeout(() => setSilent(true), SILENCE_HINT_MS);
  }, []);

  const stop = useCallback(() => {
    if (tick.current !== null) window.clearInterval(tick.current);
    tick.current = null;
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = null;

    rec.current?.stop();
    rec.current = null;
    speechMs.current = 0;
    quietMs.current = 0;

    setRecording(false);
    setCapturing(false);
    setSilent(false);
  }, []);

  const start = useCallback(async () => {
    const r = new PcmRecorder();
    try {
      await r.start();
    } catch {
      setError({
        kind: 'denied',
        message: 'Microphone access denied — enable it in your system settings.',
      });
      return;
    }

    rec.current = r;
    setRecording(true);
    setError(null);
    speechMs.current = 0;
    quietMs.current = 0;
    armHint();

    tick.current = window.setInterval(() => {
      const cur = rec.current;
      if (!cur) return;

      const all = cur.peek();
      const tail = all.subarray(Math.max(0, all.length - SAMPLE_RATE * 0.2));
      let sum = 0;
      for (let i = 0; i < tail.length; i++) sum += tail[i] * tail[i];
      const loud = Math.sqrt(sum / Math.max(1, tail.length)) > SILENCE_RMS;

      if (loud) {
        speechMs.current += STEP_MS;
        quietMs.current = 0;
        setCapturing(true);
        armHint();
        return;
      }

      if (speechMs.current < MIN_SPEECH_MS) {
        // Do not let a silent room grow the buffer without bound.
        if (all.length > SAMPLE_RATE * 30) cur.drain();
        return;
      }

      quietMs.current += STEP_MS;
      if (quietMs.current < PHRASE_GAP_MS || busy.current) return;

      /* Phrase boundary. Drain and transcribe, but keep RECORDING — dictation
         is a monologue of many phrases, so the microphone stays open and the
         next sentence is captured while this one is still with the model. */
      const pcm = cur.drain();
      speechMs.current = 0;
      quietMs.current = 0;
      busy.current = true;
      setCapturing(false);
      setTranscribing(true);

      void transcribe(pcm, engineRef.current)
        .then((t) => {
          const said = t?.text?.trim();
          if (said) onFinalRef.current(said);
        })
        .catch((e) => setError({ kind: 'interrupted', message: (e as Error).message }))
        .finally(() => {
          busy.current = false;
          setTranscribing(false);
        });
    }, STEP_MS);
  }, [armHint]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  /* Switching engine mid-dictation would strand the open recorder. */
  useEffect(() => {
    if (recording) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  /* An error the user has seen has done its job. */
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  useEffect(() => () => {
    if (tick.current !== null) window.clearInterval(tick.current);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    rec.current?.stop();
  }, []);

  return {
    recording,
    /** True while speech is being captured, before the phrase closes. */
    capturing,
    /** True while a closed phrase is with the model. */
    transcribing,
    error,
    silent,
    start,
    stop,
    toggle,
  };
}
