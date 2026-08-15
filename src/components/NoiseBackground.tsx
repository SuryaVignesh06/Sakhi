import React from 'react';

/* ─── FULL-WINDOW NOISE GRAIN ───────────────────────────────────────
   A transparent film-grain layer laid over the shader gradient. The grain
   is a tiled feTurbulence SVG rather than a second canvas or WebGL pass,
   so it costs one paint and nothing per frame — the drift is a GPU
   transform. Styling lives in index.css (.bg-noise) with the tokens. */
export const NoiseBackground: React.FC = () => (
  <div className="bg-noise" aria-hidden="true">
    <div className="bg-noise-grain" />
  </div>
);

export default NoiseBackground;
