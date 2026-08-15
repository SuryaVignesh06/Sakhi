import React, { useEffect, useState } from 'react';

export interface LiveWaveformProps {
  active: boolean;
  processing: boolean;
  level?: number;
  height?: number;
  barWidth?: number;
  barGap?: number;
  mode?: 'static' | 'scrolling';
  fadeEdges?: boolean;
  barColor?: string;
  historySize?: number;
}

export const LiveWaveform: React.FC<LiveWaveformProps> = ({
  active,
  processing,
  level = 0,
  height = 80,
  barWidth = 3,
  barGap = 2,
  mode = 'static',
  fadeEdges = true,
  barColor = 'gray',
  historySize = 120
}) => {
  const [bars, setBars] = useState<number[]>(Array(historySize).fill(0));

  useEffect(() => {
    if (!active && !processing) {
      setBars(Array(historySize).fill(0));
      return;
    }

    const interval = setInterval(() => {
      setBars(prev => {
        const newBars = [...prev];
        const audioAmp = level > 0 ? level * height : Math.random() * height;
        if (mode === 'scrolling') {
          newBars.shift();
          newBars.push(active ? audioAmp : (processing ? (Math.sin(Date.now() / 100) * height/2 + height/2) : 0));
        } else {
          for (let i = 0; i < newBars.length; i++) {
             newBars[i] = active ? (level > 0 ? (Math.random() * 0.5 + 0.5) * audioAmp : Math.random() * height) : (processing ? (Math.sin(Date.now() / 100 + i) * height/2 + height/2) : 0);
          }
        }
        return newBars;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [active, processing, level, mode, height, historySize]);

  return (
    <div className={`flex items-center justify-center overflow-hidden h-[${height}px] w-full`} style={{ height }}>
      <div className="flex items-center" style={{ gap: `${barGap}px` }}>
        {bars.map((h, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-75"
            style={{
              width: `${barWidth}px`,
              height: `${Math.max(4, h)}px`,
              backgroundColor: barColor,
              opacity: fadeEdges ? Math.sin((i / historySize) * Math.PI) : 1
            }}
          />
        ))}
      </div>
    </div>
  );
};
