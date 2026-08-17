import React from 'react';
import './shimmering-text.css';

export interface ShimmeringTextProps {
  text: string;
  className?: string;
  startOnView?: boolean;
  once?: boolean;
  repeat?: boolean;
  repeatDelay?: number;
  duration?: number;
  spread?: number;
}

export const ShimmeringText: React.FC<ShimmeringTextProps> = ({
  text,
  className = '',
  duration = 2.2,
}) => {
  return (
    <span
      className={`shimmering-text ${className}`}
      style={{
        animationDuration: `${duration}s`,
      }}
    >
      {text}
    </span>
  );
};

export default ShimmeringText;
