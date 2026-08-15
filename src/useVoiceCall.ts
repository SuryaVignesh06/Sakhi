import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PcmRecorder, SAMPLE_RATE, speak as synthesise, stopSpeaking, transcribe,
  type SttEngine,
} from './speech';

/**
 * A hands-free voice conversation — a call, not a dictation box.
 *
 *   listen ─► utterance ─► send to the SAME backend the chat uses
 *          ◄─ speak the reply ◄─ response.completed
 *
 * Now running on the project's own models rather than the browser's:
 * Parakeet TDT 0.6B for recognition online, Moonshine offline, Kokoro-82M for
 * speech in both. All of it goes through the backend, which holds the ONNX
 * sessions — see src/speech.ts for the wire format.
 *
 * Design decisions worth knowing:
 *
 *   - The microphone is CLOSED while the assistant speaks. Leaving it open
 *     makes the system transcribe its own voice and answer itself, which is
 *     the classic failure of a naive voice loop.
 *   - An utterance ends on measured silence, not on a fixed timer: these
 *     models transcribe a finished chunk rather than streaming partials, so
 *     something has to decide where the chunk ends, and loudness is the only
 *     honest signal available.
 *   - Speaking is skipped for an empty reply, so a failed turn does not leave
 *     the call sitting mute waiting for audio that never comes.
 */

export type CallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface Options {
  /** True while the call is open. */
  active: boolean;
  /** Sends the utterance to the backend. Resolve when the turn has finished. */
  onUtterance: (text: string) => Promise<void>;
  /** The assistant's reply to read out, set when the turn completes. */
  speak?: string;
  /** True while the backend is still working on the current turn. */
  busy: boolean;
  /** Offline picks Moonshine; online picks Parakeet. */
  engine?: SttEngine;
  /**
   * A pending permission the turn is blocked on. While one is open the next
   * thing said is read as an ANSWER rather than a new instruction — otherwise
   * saying "yes, go ahead" hands the agent a fresh prompt and the question it
   * was actually waiting on never gets resolved.
   */
  pendingPermissionId?: string;
  onAnswerPermission?: (id: string, granted: boolean) => void;
  /** What the agent wants to do, phrased for speech. */
  pendingPermissionPrompt?: string;
}

/* Deliberately conservative. Anything not clearly yes or no is treated as a
   normal instruction, because guessing consent is the one thing that must not
   be guessed. */
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|proceed|do it|confirm|allow|please do)/i;
const NO = /^(no|nope|nah|don't|do not|stop|cancel|deny|abort)/i;

/** Below this RMS the room counts as quiet. */
const SILENCE_RMS = 0.012;
/** Quiet for this long after speech ends the utterance. */
const SILENCE_MS = 900;
/** Ignore blips shorter than this — a cough is not a sentence. */
const MIN_SPEECH_MS = 350;
/** How often loudness is sampled. */
const TICK_MS = 100;

const rms = (pcm: Float32Array) => {
  if (!pcm.length) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
};

export function useVoiceCall({
  active, onUtterance, speak, busy, engine = 'moonshine',
  pendingPermissionId, onAnswerPermission, pendingPermissionPrompt,
}: Options) {
  const [state, setState] = useState<CallState>('idle');
  const [heard, setHeard] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Informational, not a fault — rendered quietly rather than in red. */
  const [notice, setNotice] = useState<string | null>(null);

  const rec = useRef<PcmRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const speaking = useRef(false);
  const sending = useRef(false);
  const spokenFor = useRef<string | undefined>(undefined);
  const askedFor = useRef<string | undefined>(undefined);

  /* Utterance bookkeeping, in refs because the polling loop reads them every
     tick and must not restart when they change. */
  const speechMs = useRef(0);
  const quietMs = useRef(0);

  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const permRef = useRef<{ id?: string; answer?: (id: string, granted: boolean) => void }>({});
  permRef.current = { id: pendingPermissionId, answer: onAnswerPermission };
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const clearTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  const closeMic = useCallback(() => {
    clearTimer();
    rec.current?.stop();
    rec.current = null;
    speechMs.current = 0;
    quietMs.current = 0;
  }, []);

  /** Sends what was captured, if it was worth sending. */
  const flush = useCallback(async () => {
    const r = rec.current;
    if (!r || sending.current) return;

    const pcm = r.drain();
    speechMs.current = 0;
    quietMs.current = 0;

    sending.current = true;
    setState('thinking');
    setPartial('');

    try {
      const t = await transcribe(pcm, engineRef.current);
      const said = t?.text?.trim() ?? '';

      /* Falling back is the designed behaviour when no NVIDIA key is set, not
         a failure — it is worth saying once, in passing, but painting it red
         on every utterance made a working call look broken. */
      if (t?.fellBack) setNotice('Using offline recognition (Moonshine)');
      else setNotice(null);

      if (!said) {
        sending.current = false;
        return;
      }

      setHeard(said);

      /* A question is on screen: resolve it rather than starting a new turn. */
      const { id, answer } = permRef.current;
      if (id && answer) {
        if (YES.test(said)) { answer(id, true); sending.current = false; return; }
        if (NO.test(said)) { answer(id, false); sending.current = false; return; }
        // Anything ambiguous falls through and is sent as an instruction.
      }

      await onUtteranceRef.current(said);
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    } finally {
      sending.current = false;
    }
  }, []);

  const openMic = useCallback(async () => {
    if (rec.current || speaking.current) return;

    const r = new PcmRecorder();
    try {
      await r.start();
    } catch {
      setError('Microphone access denied — enable it in your system settings.');
      setState('error');
      return;
    }

    rec.current = r;
    setState('listening');
    setError(null);
    speechMs.current = 0;
    quietMs.current = 0;

    /* One interval measures loudness on the tail of the buffer and decides
       where the utterance ends. `peek` rather than `drain`, so the audio
       stays intact for the transcriber. */
    timer.current = window.setInterval(() => {
      const cur = rec.current;
      if (!cur || sending.current || speaking.current) return;

      const all = cur.peek();
      const tail = all.subarray(Math.max(0, all.length - SAMPLE_RATE * (TICK_MS / 1000) * 2));
      const loud = rms(tail) > SILENCE_RMS;

      if (loud) {
        speechMs.current += TICK_MS;
        quietMs.current = 0;
        setPartial('…');
        return;
      }

      // Silence only counts once something has actually been said.
      if (speechMs.current < MIN_SPEECH_MS) {
        // Keep the buffer from growing without bound during a quiet room.
        if (all.length > SAMPLE_RATE * 30) cur.drain();
        return;
      }

      quietMs.current += TICK_MS;
      if (quietMs.current >= SILENCE_MS) void flush();
    }, TICK_MS);
  }, [flush]);

  /* Open and close the mic with the call itself. */
  useEffect(() => {
    if (!active) {
      closeMic();
      stopSpeaking();
      speaking.current = false;
      sending.current = false;
      setState('idle');
      setPartial('');
      setHeard('');
      setError(null);
      setNotice(null);
      return;
    }
    void openMic();
    return closeMic;
  }, [active, openMic, closeMic]);

  /* Read the reply out, then listen again. The mic is shut for the whole of
     playback so the model never hears itself. */
  useEffect(() => {
    if (!active || !speak || speak === spokenFor.current) return;
    spokenFor.current = speak;

    let cancelled = false;
    speaking.current = true;
    closeMic();
    setState('speaking');

    void synthesise(speak)
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        speaking.current = false;
        if (cancelled || !active) return;
        void openMic();
      });

    return () => {
      cancelled = true;
    };
  }, [speak, active, openMic, closeMic]);

  /**
   * Speak the permission question.
   *
   * Showing a card and waiting is fine when someone is at the keyboard; in a
   * hands-free call it just looks like the agent stopped. The question is
   * asked out loud, then the mic reopens so the answer can be spoken.
   */
  useEffect(() => {
    if (!active || !pendingPermissionId || !pendingPermissionPrompt) return;
    if (askedFor.current === pendingPermissionId) return;
    askedFor.current = pendingPermissionId;

    let cancelled = false;
    speaking.current = true;
    closeMic();
    setState('speaking');

    void synthesise(pendingPermissionPrompt)
      .catch(() => {/* A silent prompt still has the on-screen card. */})
      .finally(() => {
        speaking.current = false;
        if (cancelled || !active) return;
        void openMic();
      });

    return () => { cancelled = true; };
  }, [active, pendingPermissionId, pendingPermissionPrompt, openMic, closeMic]);

  /* Reflect backend work in the call state, so the overlay is never idle
     while a turn is genuinely running. */
  useEffect(() => {
    if (!active) return;
    if (busy && !speaking.current) setState('thinking');
  }, [busy, active]);

  useEffect(() => () => {
    closeMic();
    stopSpeaking();
  }, [closeMic]);

  return {
    state,
    /** The last complete thing the user said. */
    heard,
    /** Set while speech is being captured, before it has been transcribed. */
    partial,
    error,
    notice,
    /** Interrupts the assistant mid-sentence and listens again. */
    interrupt: useCallback(() => {
      stopSpeaking();
      speaking.current = false;
      void openMic();
    }, [openMic]),
  };
}
