import React from 'react';
import Grainient from './Grainient';

interface BackgroundShaderProps {
  isDark?: boolean;
}

/**
 * The animated background.
 *
 * ── Why this is Grainient and not ShaderGradient ────────────────────
 *
 * ShaderGradient lights its surface with an HDRI environment, and every
 * environment it offers — city, dawn, lobby — is warm. That light multiplies
 * across the whole surface, so the pink and blue stops came out orange and
 * yellow no matter which preset was chosen. There is no neutral option, and
 * turning the brightness up for light mode made it worse, not better.
 *
 * Grainient has no lighting model at all: the fragment shader mixes between
 * exactly the three colours it is given. That is the only way to guarantee
 * the palette on screen is the palette specified.
 */

const PINK = '#F7C8DC';
const BLUE = '#C9E5FA';
const BASE_DARK = '#101010';
const BASE_LIGHT = '#FFFFFF';

export const BackgroundShader: React.FC<BackgroundShaderProps> = ({ isDark = true }) => (
  <div className="bg-grainient" aria-hidden="true">
    <Grainient
      color1={PINK}
      color2={BLUE}
      color3={isDark ? BASE_DARK : BASE_LIGHT}
      timeSpeed={0.16}
      colorBalance={0}
      warpStrength={1}
      warpFrequency={4.5}
      warpSpeed={1.2}
      warpAmplitude={55}
      blendAngle={0}
      blendSoftness={0.14}
      rotationAmount={380}
      noiseScale={2}
      /* Static: animated grain across a full-screen backdrop reads as
         television static behind the text rather than as texture. */
      grainAmount={0.06}
      grainScale={2}
      grainAnimated={false}
      /* Light mode keeps contrast at 1 — pushing it lifts the pastels into
         saturation, which is the muddy look this was meant to avoid. */
      contrast={isDark ? 1.2 : 1}
      gamma={1}
      saturation={isDark ? 1 : 0.9}
      centerX={0}
      centerY={0}
      zoom={0.9}
    />
  </div>
);

export default BackgroundShader;
