import React, { useEffect, useRef, useState } from 'react';

export interface LiveWaveformProps {
  active: boolean;
  processing: boolean;
  /** Real microphone loudness, 0–1. Zero falls back to an idle shimmer. */
  level?: number;
  height?: number;
  barWidth?: number;
  barGap?: number;
  mode?: 'static' | 'scrolling';
  fadeEdges?: boolean;
  /** Any CSS colour. `currentColor` inherits from the parent. */
  barColor?: string;
  historySize?: number;
}

/**
 * A live audio meter.
 *
 * ── Two things this deliberately does not do ────────────────────────
 *
 * It does not style itself with utility classes. The original used Tailwind
 * (`flex items-center`, `h-[80px]`), and this project has no Tailwind — those
 * classes resolved to nothing, so the bars stacked vertically at their
 * natural size. Everything here is inline or in a stylesheet.
 *
 * And it does not animate on a timer when the room is quiet. `level` is the
 * measured RMS from the microphone; when it is genuinely zero the bars sit
 * near the floor instead of wobbling, so silence is visible as silence.
 */
export const LiveWaveform: React.FC<LiveWaveformProps> = ({
  active,
  processing,
  level = 0,
  height = 40,
  barWidth = 3,
  barGap = 2,
  mode = 'scrolling',
  fadeEdges = true,
  barColor = 'currentColor',
  historySize = 64,
}) => {
  const [bars, setBars] = useState<number[]>(() => Array(historySize).fill(0));
  const phase = useRef(0);

  useEffect(() => {
    if (!active && !processing) {
      setBars(Array(historySize).fill(0));
      return;
    }

    const id = window.setInterval(() => {
      phase.current += 1;
      setBars((prev) => {
        const next = prev.length === historySize ? [...prev] : Array(historySize).fill(0);

        /* Processing has no live input to show, so it gets a travelling wave —
           clearly different from speech, and clearly not idle. */
        const sample = processing
          ? (Math.sin(phase.current / 3) * 0.35 + 0.45) * height
          : Math.max(2, Math.min(1, level * 2.4) * height * (0.55 + Math.random() * 0.45));

        if (mode === 'scrolling') {
          next.shift();
          next.push(sample);
        } else {
          for (let i = 0; i < next.length; i++) {
            next[i] = processing
              ? (Math.sin(phase.current / 3 + i / 4) * 0.35 + 0.45) * height
              : sample * (0.6 + Math.random() * 0.4);
          }
        }
        return next;
      });
    }, 60);

    return () => window.clearInterval(id);
  }, [active, processing, level, mode, height, historySize]);

  return (
    <div
      className="live-waveform"
      style={{ height, color: barColor }}
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <span
          key={i}
          style={{
            width: barWidth,
            height: Math.max(2, h),
            borderRadius: barWidth,
            background: 'currentColor',
            marginRight: i === bars.length - 1 ? 0 : barGap,
            opacity: fadeEdges ? 0.25 + 0.75 * Math.sin((i / (bars.length - 1)) * Math.PI) : 1,
            transition: 'height 70ms linear',
          }}
        />
      ))}
    </div>
  );
};

export default LiveWaveform;
