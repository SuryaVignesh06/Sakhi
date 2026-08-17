import { useCallback, useEffect, useRef, useState } from 'react';
import { PcmRecorder, SAMPLE_RATE, transcribe } from './speech';

/**
 * Always-on wake word: "Sakhi" / "Hey Sakhi".
 *
 * This used to run on `webkitSpeechRecognition`, which Electron does not ship
 * — so the wake word had never fired even once in the desktop app. It now
 * listens locally through Moonshine, which suits the job better anyway:
 * always-on detection should not be streaming a live microphone to a cloud
 * service all day.
 *
 * Only SHORT bursts are transcribed. Between them the audio is thrown away,
 * so nothing is retained, and the model only runs on ~1.5s of speech at a
 * time rather than continuously.
 */

/**
 * Spoken forms to accept.
 *
 * Matched WITHOUT word boundaries, because Moonshine frequently glues the
 * name to a neighbour ("heysakhi", "sakhicanyou"). Requiring  meant those
 * never matched. Recognisers also land on neighbours of any short name, and
 * refusing them makes the wake word feel broken — the cost of a false
 * positive here is only that a listening window opens.
 */
const WAKE =
  /(sakh?i|saakhi|sakk?i|sakhee|sakhy|shakh?i|zakh?i|sathi|saathi|sarkhi|sakshi|socky|soggy|psyche)/i;

/**
 * Loudness below which we do not even bother transcribing.
 *
 * Lowered: a wake word is often said from across the room, and the old gate
 * was rejecting exactly the quiet utterances people actually use.
 */
const RMS_GATE = 0.008;

/** How much audio each detection pass looks at. */
const WINDOW_MS = 1400;

/**
 * How often a pass runs.
 *
 * Deliberately much shorter than the window, so consecutive passes OVERLAP.
 * The previous version drained its buffer on every pass, which meant a word
 * spoken across a boundary was cut in half and neither half was recognisable
 * — whether "Sakhi" registered came down to the luck of when you said it.
 */
const STEP_MS = 250;

/** Ignore a second trigger inside this window; one wake per utterance. */
const COOLDOWN_MS = 2500;

/**
 * Consecutive transcription failures before the loop stands down.
 *
 * Recognition happens on the backend, so with no backend running the wake
 * word CANNOT fire — and this loop was still holding the microphone open and
 * posting a ~90KB window four times a second, forever, from the moment the
 * app launched. The capture itself runs through a ScriptProcessorNode, which
 * is a main-thread callback, so the cost landed on the same thread as the UI.
 * That combination is a large part of why the app felt like it seized up.
 *
 * After a few failures it releases the microphone entirely and just probes
 * for the backend on a slow timer, picking straight back up when it returns.
 */
const FAIL_LIMIT = 3;

/** How often to check whether the backend has come back. */
const PROBE_MS = 20_000;

export function useWakeWord(enabled: boolean, onWake: () => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rec = useRef<PcmRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const probe = useRef<number | null>(null);
  const busy = useRef(false);
  const fails = useRef(0);
  const lastFire = useRef(0);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  /** Releases the microphone and the interval, but not the probe. */
  const release = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    rec.current?.stop();
    rec.current = null;
    busy.current = false;
    setListening(false);
  }, []);

  const stop = useCallback(() => {
    if (probe.current !== null) window.clearInterval(probe.current);
    probe.current = null;
    fails.current = 0;
    release();
  }, [release]);

  const start = useCallback(async () => {
    if (rec.current) return;

    const r = new PcmRecorder();
    try {
      await r.start();
    } catch {
      setError('Microphone unavailable — wake word is off.');
      return;
    }

    rec.current = r;
    fails.current = 0;
    setListening(true);
    setError(null);

    timer.current = window.setInterval(() => {
      const cur = rec.current;
      if (!cur || busy.current) return;

      if (Date.now() - lastFire.current < COOLDOWN_MS) return;

      const all = cur.peek();
      const want = Math.floor(SAMPLE_RATE * (WINDOW_MS / 1000));

      /* Examine a short buffer rather than waiting for a full window.
         Requiring the whole window meant the first ~2s after opening the mic
         were dead — say the name immediately after the app starts and nothing
         was listening yet, which is exactly the "it took three tries" case. */
      if (all.length < SAMPLE_RATE * 0.5) return;

      /* Look at a SLIDING window and leave the audio in place, so the next
         pass re-examines the overlap. Only the part that has aged past the
         window is discarded, which bounds memory without ever cutting a word
         at a boundary. */
      const win = all.length > want ? all.slice(-want) : all;
      if (all.length > want * 2) cur.trimTo(want);

      let sum = 0;
      for (let i = 0; i < win.length; i++) sum += win[i] * win[i];
      if (Math.sqrt(sum / win.length) < RMS_GATE) return;

      busy.current = true;
      void transcribe(win, 'moonshine')
        .then((t) => {
          fails.current = 0;
          const said = t?.text ?? '';
          if (!WAKE.test(said)) return;
          if (Date.now() - lastFire.current < COOLDOWN_MS) return;
          lastFire.current = Date.now();
          // Clear so the trigger phrase is not re-detected next pass.
          rec.current?.drain();
          onWakeRef.current();
        })
        .catch(() => {
          /* A single missed window is not worth surfacing. A run of them
             means the recogniser is not there, and continuing to capture and
             post is spending the user's CPU on something that cannot work. */
          if (++fails.current >= FAIL_LIMIT) {
            release();
            setError('Wake word paused — speech backend not reachable.');
          }
        })
        .finally(() => { busy.current = false; });
    }, STEP_MS);
  }, [release]);

  useEffect(() => {
    if (!enabled) {
      stop();
      return stop;
    }

    void start();

    /* Retry on a slow timer so the wake word comes back by itself once the
       backend is up, without the caller having to know or restart anything. */
    probe.current = window.setInterval(() => {
      if (!rec.current) void start();
    }, PROBE_MS);

    return stop;
  }, [enabled, start, stop]);

  return { listening, error };
}

export default useWakeWord;
