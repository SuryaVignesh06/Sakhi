import React from 'react';
import { cn } from '@/lib/utils';

export interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glowIntensity?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shadowIntensity?: 'none' | 'sm' | 'md' | 'lg';
  borderRadius?: string;
  blurIntensity?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  draggable?: boolean;
  className?: string;
}

export const LiquidGlassCard: React.FC<LiquidGlassCardProps> = ({
  children,
  glowIntensity = 'md',
  shadowIntensity = 'md',
  borderRadius = '24px',
  blurIntensity = 'lg',
  draggable = false,
  className = '',
  style,
  ...props
}) => {
  const blurMap = {
    none: '0px',
    sm: '20px',
    md: '32px',
    lg: '44px',
    xl: '60px',
  };

  const shadowMap = {
    none: 'none',
    sm: '0 8px 32px rgba(0, 0, 0, 0.3)',
    md: '0 16px 48px rgba(0, 0, 0, 0.4)',
    lg: '0 24px 64px rgba(0, 0, 0, 0.5)',
  };

  const glowMap = {
    none: 'none',
    sm: '0 0 24px rgba(59, 130, 246, 0.08), 0 0 40px rgba(236, 72, 153, 0.06)',
    md: '0 0 36px rgba(59, 130, 246, 0.14), 0 0 54px rgba(236, 72, 153, 0.10)',
    lg: '0 0 48px rgba(59, 130, 246, 0.20), 0 0 72px rgba(236, 72, 153, 0.14)',
    xl: '0 0 64px rgba(59, 130, 246, 0.26), 0 0 96px rgba(236, 72, 153, 0.18)',
    '2xl': '0 0 80px rgba(59, 130, 246, 0.32), 0 0 120px rgba(236, 72, 153, 0.22)',
  };

  const blurVal = blurMap[blurIntensity] || '36px';
  const shadowVal = shadowMap[shadowIntensity] || shadowMap.md;
  const glowVal = glowMap[glowIntensity] || glowMap.md;

  return (
    <div
      className={cn('liquid-glass-card-root', className)}
      style={{
        borderRadius,
        position: 'relative',
        background: 'radial-gradient(140% 120% at 50% 0%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 60%, rgba(10, 10, 16, 0.45) 100%)',
        backdropFilter: `blur(${blurVal}) saturate(200%)`,
        WebkitBackdropFilter: `blur(${blurVal}) saturate(200%)`,
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: `${shadowVal}, ${glowVal}, inset 0 1.5px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(255, 255, 255, 0.08)`,
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {/* Specular Liquid Ambient Highlight Sheen */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: '8%',
          right: '8%',
          height: '1.5px',
          background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0) 80%)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
};

export default LiquidGlassCard;
