import React from 'react';
import { cn } from '@/lib/utils';

export interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  borderRadius?: string;
  glowIntensity?: string; // Kept for compatibility with existing call sites
  shadowIntensity?: string;
  blurIntensity?: string;
  draggable?: boolean;
  className?: string;
}

/**
 * A frosted panel.
 *
 * Three things about the previous version cost real frames on every render:
 *
 * 1. It returned an inline `<style>` element as part of its output, so React
 *    tore down and re-created a stylesheet node — forcing a full style
 *    recalculation for the document — every time the component re-rendered.
 *    The sidebar re-renders on each tab change, each theme flip, each profile
 *    toggle. The rules are static, so they belong in the stylesheet below,
 *    written once at module load.
 *
 * 2. It inlined a ~30KB base64 WebP displacement map into an SVG filter, once
 *    per instance, all sharing the id `liquid-glass-filter`. Duplicate ids
 *    mean the browser resolves `url(#liquid-glass-filter)` to whichever came
 *    first, so every copy after the first was pure weight.
 *
 * 3. `backdrop-filter: blur(8px) url(#liquid-glass-filter) saturate(150%)`
 *    asked the compositor to run an SVG displacement pass over whatever sits
 *    behind the panel. Behind this panel is a fullscreen WebGL canvas that
 *    repaints continuously, so the filter re-ran every frame over the full
 *    height of the sidebar. That was the second-biggest source of the stall,
 *    after the shader itself.
 *
 * The surface it actually paints is set by `.sidebar-liquid-inner` and
 * `.composer` in index.css, which already override the fill, the border and
 * the shadow with `!important`. So what is lost here is the displacement
 * refraction, which those overrides were hiding anyway.
 */

const STYLE_ID = 'liquid-glass-card-styles';

const CSS = `
.liquid-glass-card-root {
  --c-light: 255, 255, 255;
  --c-dark: 0, 0, 0;
  --glass-reflex-dark: 1;
  --glass-reflex-light: 1;

  position: relative;
  background-color: rgba(var(--ink), 0.05);
  box-shadow:
    inset 0 0 0 1px rgba(var(--c-light), calc(var(--glass-reflex-light) * 0.10)),
    inset 1.8px 3px 0 -2px rgba(var(--c-light), calc(var(--glass-reflex-light) * 0.55)),
    inset -2px -2px 0 -2px rgba(var(--c-light), calc(var(--glass-reflex-light) * 0.45)),
    inset -0.3px -1px 4px 0 rgba(var(--c-dark), calc(var(--glass-reflex-dark) * 0.12)),
    inset 0 3px 4px -2px rgba(var(--c-dark), calc(var(--glass-reflex-dark) * 0.18)),
    0 1px 5px 0 rgba(var(--c-dark), calc(var(--glass-reflex-dark) * 0.10)),
    0 6px 16px 0 rgba(var(--c-dark), calc(var(--glass-reflex-dark) * 0.08));
}

/* On a light ground the specular highlights have to come down hard — at full
   strength they are white-on-white and the panel loses its edge entirely. */
:root[data-theme='light'] .liquid-glass-card-root {
  --glass-reflex-light: 0.5;
  --glass-reflex-dark: 0.35;
}
`;

/* Injected once, at module load, outside the React tree. */
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export const LiquidGlassCard: React.FC<LiquidGlassCardProps> = ({
  children,
  borderRadius = '24px',
  glowIntensity,
  shadowIntensity,
  blurIntensity,
  draggable = false,
  className = '',
  style,
  ...props
}) => {
  /* Accepted for API compatibility and deliberately unused — the surface is
     owned by the stylesheet so every panel stays consistent. */
  void glowIntensity;
  void shadowIntensity;
  void blurIntensity;
  void draggable;

  return (
    <div
      className={cn('liquid-glass-card-root', className)}
      style={{ borderRadius, ...style }}
      {...props}
    >
      {children}
    </div>
  );
};

export default LiquidGlassCard;
