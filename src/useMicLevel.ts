import { useEffect, useRef, useState } from 'react';

/**
 * Real microphone amplitude, for driving the voice visuals.
 *
 * The overlay used `0.2 + Math.random() * 0.6` on a 240ms interval — an
 * animation that looked identical whether you were speaking, silent, or had no
 * microphone at all. Spec §22 is explicit that the visuals must react to real
 * audio, and it is right: a fake level actively misleads, because the user
 * reads it as "it can hear me".
 *
 * Returns a smoothed 0..1 level. Smoothing matters — raw RMS jitters frame to
 * frame and makes the orb vibrate rather than breathe.
 */
export function useMicLevel(active: boolean): { level: number; available: boolean } {
  const [level, setLevel] = useState(0);
  const [available, setAvailable] = useState(false);

  const raf = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smoothed = useRef(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }

    let cancelled = false;

    const stop = () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      smoothed.current = 0;
    };

    navigator.mediaDevices
      ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setAvailable(true);

        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        // Small FFT: this is an amplitude meter, not a spectrogram, and a
        // smaller buffer responds faster to speech onsets.
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);

        const buf = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(buf);

          // RMS around the 128 midpoint of unsigned 8-bit PCM.
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);

          /* Speech RMS sits around 0.02–0.25, so it is scaled into a usable
             range and clamped rather than shown raw — otherwise the orb barely
             moves at normal speaking volume. */
          const scaled = Math.min(1, rms * 4.5);

          // Attack faster than release: it should jump on a syllable and ease
          // back down, the way a real level meter behaves.
          const prev = smoothed.current;
          smoothed.current = scaled > prev ? prev + (scaled - prev) * 0.45 : prev + (scaled - prev) * 0.12;

          setLevel(Number(smoothed.current.toFixed(3)));
          raf.current = requestAnimationFrame(tick);
        };

        raf.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        // No microphone, or refused. Report it rather than animating anyway.
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);

  return { level, available };
}
