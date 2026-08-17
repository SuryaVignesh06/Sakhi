import React, { useEffect, useState } from 'react';
import './LiveWaveform.css';

interface LiveWaveformProps {
  active: boolean;
  processing?: boolean;
}

export function LiveWaveform({ active, processing }: LiveWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array.from({ length: 15 }, () => 10));

  useEffect(() => {
    if (!active && !processing) {
      setBars(Array.from({ length: 15 }, () => 10));
      return;
    }

    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() =>
          processing
            ? 30 + Math.random() * 20
            : 10 + Math.random() * 50
        )
      );
    }, 100);

    return () => clearInterval(interval);
  }, [active, processing]);

  if (!active && !processing) return null;

  return (
    <div className="live-waveform-container">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`waveform-bar ${processing ? 'processing' : ''}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}
