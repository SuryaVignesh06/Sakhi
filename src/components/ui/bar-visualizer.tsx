import React from 'react';

export type AgentState = 'listening' | 'speaking' | 'thinking' | 'connecting' | 'initializing' | null;

export interface BarVisualizerProps {
  state: AgentState;
  demo?: boolean;
  barCount?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

export const BarVisualizer: React.FC<BarVisualizerProps> = ({
  state,
  demo = false,
  barCount = 20,
  minHeight = 15,
  maxHeight = 90,
  className = ''
}) => {
  const bars = Array.from({ length: barCount }, (_, i) => i);
  
  return (
    <div className={`flex items-end justify-center gap-1 ${className}`}>
      {bars.map((bar, i) => {
        // Pseudo-random height for visual effect based on state
        const hBase = state === 'speaking' ? Math.random() * (maxHeight - minHeight) + minHeight :
                     state === 'listening' ? Math.random() * (maxHeight / 2 - minHeight) + minHeight :
                     minHeight;
                     
        return (
          <div 
            key={i}
            className={`w-2 rounded-t-md transition-all duration-100 ${state === 'speaking' ? 'bg-primary' : 'bg-primary/50'}`}
            style={{ height: `${hBase}%` }}
          />
        );
      })}
    </div>
  );
};
