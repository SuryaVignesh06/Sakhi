import React, { useRef } from 'react';

export type AgentState = 'listening' | 'talking' | 'thinking' | null;

export interface OrbProps {
  colors?: string[];
  seed?: number;
  agentState: AgentState;
  className?: string;
}

export const Orb: React.FC<OrbProps> = ({ colors = [], seed = 0, agentState, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fallbacks for colors
  const color1 = colors[0] || '#CADCFC';
  const color2 = colors[1] || '#A0B9D1';

  let animationClass = '';
  if (agentState === 'thinking') animationClass = 'animate-pulse';
  if (agentState === 'talking') animationClass = 'animate-bounce';

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center transition-all duration-300 ${animationClass} ${className}`}
      style={{
        background: `radial-gradient(circle at center, ${color1} 0%, ${color2} 100%)`,
        borderRadius: '50%',
        boxShadow: agentState === 'talking' ? `0 0 20px ${color1}, inset 0 0 10px white` : 
                   agentState === 'listening' ? `0 0 10px ${color1}, inset 0 0 5px white` : 
                   'none',
        filter: agentState === null ? 'grayscale(50%) opacity(0.8)' : 'none'
      }}
    >
      <div className="absolute inset-0 rounded-full bg-white/20 backdrop-blur-sm mix-blend-overlay" />
    </div>
  );
};
