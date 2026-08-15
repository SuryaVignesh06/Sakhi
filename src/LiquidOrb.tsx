import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export interface LiquidOrbProps {
  size?: number | string;                 // px or string
  voiceLevel?: number;                    // 0-1 live audio level
  state?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  onClick?: () => void;
  className?: string;
  colors?: {
    bg?: string;
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
  };
}

// Morphing organic wavy SVG paths for liquid blob outline
const BLOB_PATHS = {
  idle1: "M200 40 C280 35, 360 80, 365 170 C370 260, 310 345, 205 360 C100 375, 30 300, 35 195 C40 90, 120 45, 200 40 Z",
  idle2: "M205 45 C290 40, 355 95, 355 185 C355 275, 300 350, 195 355 C90 360, 40 285, 45 180 C50 75, 120 50, 205 45 Z",
  listening1: "M200 25 C310 25, 385 80, 380 200 C375 320, 295 375, 200 375 C105 375, 20 320, 20 200 C20 80, 90 25, 200 25 Z",
  listening2: "M200 35 C290 25, 370 88, 365 195 C360 302, 300 368, 195 365 C90 362, 30 295, 35 190 C40 85, 110 45, 200 35 Z",
  thinking1: "M210 35 C275 55, 350 70, 360 160 C370 250, 325 355, 215 365 C105 375, 35 315, 30 215 C25 115, 145 15, 210 35 Z",
  speaking1: "M200 18 C325 18, 395 80, 390 205 C385 330, 305 385, 200 385 C95 385, 10 330, 10 205 C10 80, 75 18, 200 18 Z"
};

export const LiquidOrb: React.FC<LiquidOrbProps> = ({
  size = 360,
  voiceLevel = 0,
  state = 'idle',
  onClick,
  className = '',
  colors
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const numericSize = typeof size === 'number' ? size : parseInt(size.toString().replace('px', ''), 10) || 360;

  // Parallax Tilt Springs
  const mouseX = useSpring(0, { stiffness: 140, damping: 14 });
  const mouseY = useSpring(0, { stiffness: 140, damping: 14 });
  const rotateX = useTransform(mouseY, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-6, 6]);

  const [isHovered, setIsHovered] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  // Default vibrant Siri mesh palette
  const defaultColors = {
    bg: "oklch(15% 0.04 260)",
    c1: "oklch(70% 0.22 45)", // Vibrant Pink
    c2: "oklch(70% 0.20 250)", // Electric Blue
    c3: "oklch(65% 0.22 35)", // Deep Violet
    c4: "oklch(65% 0.20 260)", // Magenta
  };

  const finalColors = { ...defaultColors, ...colors };

  // Calculate dynamic loop speed and scale based on voice state and audio level
  const speedMultiplier = state === 'speaking' ? 2.2 + voiceLevel * 2 : state === 'listening' ? 1.5 + voiceLevel * 1.8 : state === 'thinking' ? 1.8 : 1.0;
  const loopDuration = 18 / speedMultiplier;
  const scaleGain = 1 + (state === 'speaking' ? voiceLevel * 0.15 : state === 'listening' ? voiceLevel * 0.1 : 0);

  // Determine SVG morphing paths
  let currentPath = BLOB_PATHS.idle1;
  let targetPath = BLOB_PATHS.idle2;
  let duration = 6;

  if (state === 'listening') {
    currentPath = BLOB_PATHS.listening1;
    targetPath = BLOB_PATHS.listening2;
    duration = 3.2 - voiceLevel * 1.8;
  } else if (state === 'thinking') {
    currentPath = BLOB_PATHS.thinking1;
    targetPath = BLOB_PATHS.idle2;
    duration = 2.0;
  } else if (state === 'speaking') {
    currentPath = BLOB_PATHS.speaking1;
    targetPath = BLOB_PATHS.listening1;
    duration = 1.1 - voiceLevel * 0.5;
  }

  // Pointer Movement
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  }, [mouseX, mouseY]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 400;
    const y = ((e.clientY - rect.top) / rect.height) * 400;

    const newRipple = { id: Date.now(), x, y };
    setRipples(prev => [...prev, newRipple]);

    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 800);

    onClick?.();
  }, [onClick]);

  return (
    <motion.div
      ref={containerRef}
      className={`relative liquid-orb-wrapper ${className}`}
      style={{
        width: numericSize,
        height: numericSize,
        perspective: 1000,
        rotateX,
        rotateY,
        scale: scaleGain
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* 1. Ambient Background Bloom Glow */}
      <motion.div
        animate={{ opacity: isHovered ? 0.75 : 0.55 }}
        className="absolute rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${finalColors.c2} 0%, rgba(255, 100, 0, 0.15) 45%, transparent 70%)`,
          filter: `blur(${numericSize * 0.28}px)`,
          inset: "-12%",
        }}
      />

      {/* 2. Core Conic Mesh Siri Orb */}
      <div
        className="siri-orb"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          borderRadius: '50%',
          overflow: 'hidden',
          isolation: 'isolate',
          ["--animation-duration" as any]: `${loopDuration}s`,
          ["--bg" as any]: finalColors.bg,
          ["--c1" as any]: finalColors.c1,
          ["--c2" as any]: finalColors.c2,
          ["--c3" as any]: finalColors.c3,
          ["--c4" as any]: finalColors.c4,
          ["--rim" as any]: `${Math.max(numericSize * 0.06, 2)}px`,
        }}
      >
        {/* Specular Sheen & Depth Rim Layers */}
        <span aria-hidden="true" className="siri-orb-layer siri-orb-sheen" />
        <span aria-hidden="true" className="siri-orb-layer siri-orb-rim" />

        {/* Dynamic Wavy SVG Filtered Layer */}
        <svg
          viewBox="0 0 400 400"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            zIndex: 3
          }}
        >
          <defs>
            <filter id="wavy-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={state === 'speaking' ? 0.025 : 0.015}
                numOctaves="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={state === 'speaking' ? 25 + voiceLevel * 30 : 15}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>

          {/* Morphing Wavy Blob Path */}
          <motion.path
            d={currentPath}
            animate={{ d: [currentPath, targetPath, currentPath] }}
            transition={{ repeat: Infinity, duration, ease: "easeInOut" }}
            fill="none"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="2.5"
            filter="url(#wavy-blur)"
          />

          {/* Click Ripples */}
          {ripples.map(r => (
            <motion.circle
              key={r.id}
              cx={r.x}
              cy={r.y}
              initial={{ r: 5, opacity: 0.8 }}
              animate={{ r: 180, opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
            />
          ))}
        </svg>

        <style>{`
          @property --angle {
            syntax: "<angle>";
            inherits: false;
            initial-value: 0deg;
          }

          .siri-orb {
            display: grid;
            grid-template-areas: "stack";
            overflow: hidden;
            border-radius: 50%;
            position: relative;
            isolation: isolate;
            box-shadow: 0 0 40px rgba(255, 100, 0, 0.3);
          }

          .siri-orb::before,
          .siri-orb::after,
          .siri-orb > .siri-orb-layer {
            content: "";
            display: block;
            grid-area: stack;
            width: 100%;
            height: 100%;
            border-radius: 50%;
          }

          .siri-orb-sheen {
            background:
              radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.4), transparent 34%),
              radial-gradient(circle at 72% 80%, rgba(255, 255, 255, 0.12), transparent 48%);
            mix-blend-mode: screen;
            animation: siri-drift 10s ease-in-out infinite alternate;
            z-index: 2;
          }

          .siri-orb-rim {
            box-shadow:
              inset 0 0 0 1px rgba(255, 255, 255, 0.3),
              inset 0 calc(var(--rim) * 1) calc(var(--rim) * 2) rgba(255, 255, 255, 0.35),
              inset 0 calc(var(--rim) * -1.2) calc(var(--rim) * 2.4) rgba(0, 0, 0, 0.6);
            pointer-events: none;
            z-index: 4;
          }

          @keyframes siri-drift {
            0% { transform: translate(-5%, -4%) scale(1.04); }
            100% { transform: translate(6%, 5%) scale(1.1); }
          }

          .siri-orb::before {
            background:
              conic-gradient(
                from calc(var(--angle) * 2) at 25% 70%,
                var(--c3),
                transparent 20% 80%,
                var(--c3)
              ),
              conic-gradient(
                from calc(var(--angle) * 2) at 45% 75%,
                var(--c2),
                transparent 30% 60%,
                var(--c2)
              ),
              conic-gradient(
                from calc(var(--angle) * -3) at 80% 20%,
                var(--c1),
                transparent 40% 60%,
                var(--c1)
              ),
              conic-gradient(
                from calc(var(--angle) * 1.5) at 60% 35%,
                var(--c4),
                transparent 25% 75%,
                var(--c4)
              ),
              conic-gradient(
                from calc(var(--angle) * 2) at 15% 5%,
                var(--c2),
                transparent 10% 90%,
                var(--c2)
              ),
              conic-gradient(
                from calc(var(--angle) * 1) at 20% 80%,
                var(--c1),
                transparent 10% 90%,
                var(--c1)
              ),
              conic-gradient(
                from calc(var(--angle) * -2) at 85% 10%,
                var(--c3),
                transparent 20% 80%,
                var(--c3)
              );
            box-shadow: inset var(--bg) 0 0 20px 4px;
            filter: blur(28px) contrast(1.4) saturate(1.5);
            animation: rotate var(--animation-duration) linear infinite;
            z-index: 1;
          }

          .siri-orb::after {
            background-image: radial-gradient(
              circle at center,
              rgba(255, 255, 255, 0.15) 1.5px,
              transparent 1.5px
            );
            background-size: 6px 6px;
            backdrop-filter: blur(8px) contrast(1.3);
            mix-blend-mode: overlay;
            z-index: 2;
          }

          @keyframes rotate {
            to {
              --angle: 360deg;
            }
          }
        `}</style>
      </div>
    </motion.div>
  );
};

export default LiquidOrb;
