import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Color, MathUtils, Vector3 } from 'three';
import * as THREE from 'three';

extend({ IcosahedronGeometry: THREE.IcosahedronGeometry });

/**
 * The voice agent's orb: an icosahedron displaced by Perlin noise.
 *
 * The shader is the one supplied for this. Two things were added on top of
 * it: the colour is a uniform driven by the theme rather than a constant, and
 * the displacement amount is driven by live microphone amplitude, so the
 * surface actually moves with the voice instead of idling at a fixed rate.
 */

const vertexShader = /* glsl */ `
uniform float u_intensity;
uniform float u_time;

varying vec2 vUv;
varying float vDisplacement;

vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
}

void main() {
    vUv = uv;
    vDisplacement = cnoise(position + vec3(2.0 * u_time));
    vec3 newPosition = position + normal * (u_intensity * vDisplacement);
    vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform float u_intensity;
uniform float u_time;
uniform vec3 u_color;
uniform vec3 u_highlight;

varying vec2 vUv;
varying float vDisplacement;

void main() {
    float distort = 2.0 * vDisplacement * u_intensity * sin(vUv.y * 10.0 + u_time);
    vec3 color = mix(u_color, u_highlight, distort);

    /* Depth that follows the SURFACE rather than a circle drawn around it.
       Troughs (negative displacement) darken as if occluded, crests catch a
       little light — the inner-shadow read, without any ring. */
    float cavity = smoothstep(-0.6, 0.35, vDisplacement);
    color *= mix(0.62, 1.06, cavity);

    // Grounds the lower half so the form does not float.
    color *= mix(0.88, 1.0, smoothstep(0.0, 0.55, vUv.y));

    gl_FragColor = vec4(color, 1.0);
}
`;

interface BlobProps {
  /** 0..1 live microphone/output amplitude. */
  level: number;
  isDark: boolean;
}

const Blob: React.FC<BlobProps> = ({ level, isDark }) => {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_intensity: { value: 0.3 },
      /**
       * Base and highlight must sit at OPPOSITE ends of the value range —
       * that contrast is the entire source of the blob's form, because the
       * fragment shader mixes between them by displacement.
       *
       * A white base mixed toward pale blue is what produced a shapeless
       * white mass: both ends were bright, so there was nothing to shade
       * with. Light mode is the original's black-toward-white; dark mode is
       * that same relationship inverted.
       */
      u_color: { value: new Color(isDark ? 0xf2f4f8 : 0x0B0B0D) },
      u_highlight: { value: new Color(isDark ? 0x05070C : 0xFFFFFF) },
    }),
    // Rebuilt on theme change; the material picks the new uniforms up with it.
    [isDark]
  );

  const target = useRef(new Vector3(0, 0, 0));
  const current = useRef(new Vector3(0, 0, 0));

  useFrame((state) => {
    const { clock, mouse } = state;
    if (!mesh.current) return;

    const material = mesh.current.material as THREE.ShaderMaterial;
    material.uniforms.u_time.value = 0.4 * clock.getElapsedTime();

    /* Loudness drives how far the surface pushes out. Lerped rather than set,
       because raw amplitude jitters frame to frame and makes the orb vibrate
       instead of breathe. */
    /* Kept in the range that stays organic. Much past ~0.55 the icosahedron
       tears into spikes instead of billowing. */
    material.uniforms.u_intensity.value = MathUtils.lerp(
      material.uniforms.u_intensity.value,
      0.26 + Math.min(1, level) * 0.28,
      0.06
    );

    // A slow drift so the orb is never perfectly still, plus a gentle lean
    // toward the pointer.
    const t = clock.getElapsedTime();
    target.current.set(mouse.x * 0.25 + Math.sin(t * 0.3) * 0.06, mouse.y * 0.25 + Math.cos(t * 0.24) * 0.06, 0);
    current.current.lerp(target.current, 0.06);
    mesh.current.position.copy(current.current);
    mesh.current.rotation.y = t * 0.07;
  });

  return (
    <mesh ref={mesh} scale={1.55}>
      <icosahedronGeometry args={[2, 20]} />
      <shaderMaterial
        key={isDark ? 'dark' : 'light'}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
};

/**
 * The orb is always the opposite of what it sits on: pale on a dark field,
 * dark on a light one.
 *
 * No <Environment> and no <Lightformer> here, deliberately. A raw
 * ShaderMaterial computes its own colour and ignores scene lights and
 * environment maps entirely, so they contributed nothing to the blob — and
 * because Lightformers are real meshes, having them in the scene rather than
 * nested inside <Environment> drew them as the white planes that looked like
 * the orb had shattered. All the shading here comes from the fragment shader.
 */
export const VoiceOrb: React.FC<{ level?: number; isDark?: boolean; className?: string }> = ({
  level = 0,
  isDark = true,
  className = '',
}) => (
  <div className={`voice-orb ${className}`} aria-hidden="true">
    <Canvas
      camera={{ position: [0, 0, 8] }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      // Transparent clear colour, so the orb can float over the desktop
      // rather than sitting on an opaque square.
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Blob level={level} isDark={isDark} />
    </Canvas>
    {/* Fine grain over the render, which softens the banding the smooth
        gradient would otherwise show on a large flat surface. */}
    <span className="voice-orb-grain" />
  </div>
);

export default VoiceOrb;
