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
  if (typeof children !== 'string') {
    return (
      <motion.span
        initial={{ opacity: 0, filter: 'blur(8px)', y: 8 }}
        animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={className}
      >
        {children}
      </motion.span>
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
