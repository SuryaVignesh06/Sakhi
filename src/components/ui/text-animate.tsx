import React from 'react';
import { motion } from 'framer-motion';

export type AnimationType = 'blurInUp' | 'blurIn' | 'fadeIn' | 'slideUp';
export type AnimateBy = 'character' | 'word' | 'line';

export interface TextAnimateProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  animation?: AnimationType;
  by?: AnimateBy;
  once?: boolean;
  className?: string;
  delay?: number;
  duration?: number;
}

export function TextAnimate({
  children,
  animation = 'blurInUp',
  by = 'character',
  once = true,
  className = '',
  delay = 0,
  duration = 0.28,
  ...props
}: TextAnimateProps) {
  /* Rich children (a rendered markdown tree, typically) animate as one block.
     Two things matter here:

     - it must be a BLOCK. This was a `motion.span`, and an inline element
       wrapping the block-level output of the markdown renderer collapsed the
       paragraph and heading spacing inside it.
     - no blur. Animating `filter` on a whole answer forces the compositor to
       re-rasterise the full text area every frame of the transition, which is
       what made a long reply land with a visible stutter. Opacity and a small
       translate give the same read for a fraction of the cost. */
  if (typeof children !== 'string') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', minWidth: 0 }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  const text = children;

  const variants = {
    hidden: {
      opacity: 0,
      filter: 'blur(10px)',
      y: animation === 'blurInUp' ? 10 : 0,
    },
    visible: (i: number) => ({
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        delay: delay + i * (by === 'character' ? 0.012 : 0.04),
        duration,
        ease: [0.22, 1, 0.36, 1],
      },
    }),
  };

  if (by === 'word') {
    const words = text.split(' ');
    return (
      <span className={`inline ${className}`} {...props}>
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            custom={i}
            initial="hidden"
            animate="visible"
            viewport={{ once }}
            variants={variants}
            className="inline-block mr-[0.25em]"
          >
            {word}
          </motion.span>
        ))}
      </span>
    );
  }

  // by === 'character'
  const letters = Array.from(text);
  return (
    <span className={`inline ${className}`} {...props}>
      {letters.map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          custom={i}
          initial="hidden"
          animate="visible"
          viewport={{ once }}
          variants={variants}
          className="inline-block"
          style={{ whiteSpace: char === ' ' ? 'pre' : 'normal' }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

export default TextAnimate;
