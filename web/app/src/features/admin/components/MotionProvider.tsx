import { MotionConfig } from 'motion/react';
import type React from 'react';
import { useMotionMode } from '../../../lib/motion/mode';
import { DURATION, EASE } from '../../../lib/motion/tokens';

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useMotionMode();

  const isReduced = mode === 'reduced';
  const isLite = mode === 'lite';

  // Scale transition defaults based on effective mode:
  // - reduced: 100ms duration, instantaneous transforms dropped
  // - lite: halved duration (120ms), linear/no overshoot curve
  // - full: standard 240ms spring physics
  const defaultTransition = {
    duration: isReduced ? 0.1 : isLite ? DURATION.normal * 0.5 : DURATION.normal,
    ease: isLite ? ([0.25, 1, 0.5, 1] as const) : EASE.spring,
  };

  return (
    <MotionConfig reducedMotion={isReduced ? 'always' : 'user'} transition={defaultTransition}>
      {children}
    </MotionConfig>
  );
}
