/**
 * Physics-based motion tokens and spring animation definitions.
 *
 * PURE MODULE: strictly no React or framework imports, safe to import everywhere
 * (including CSS/WAAPI modules and non-React utilities).
 *
 * Single source of truth: CSS variables in `src/index.css` are kept in sync:
 *   --dur-fast: 120ms;
 *   --dur-normal: 240ms;
 *   --dur-slow: 350ms;
 *   --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
 */

export const DURATION = {
  fast: 0.12,
  normal: 0.24,
  slow: 0.35,
} as const;

export const EASE = {
  spring: [0.16, 1, 0.3, 1] as const,
} as const;

export const SPRING = {
  soft: {
    type: 'spring',
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  },
  snappy: {
    type: 'spring',
    stiffness: 450,
    damping: 35,
    mass: 0.8,
  },
  gentle: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
    mass: 1.0,
  },
} as const;

/**
 * Computes stagger delay in seconds for list or grid item transitions.
 * @param index Index of the item
 * @param staggerDelay Step delay between consecutive items (default 0.04s)
 * @param baseDelay Initial delay offset (default 0s)
 */
export function getStaggerDelay(index: number, staggerDelay = 0.04, baseDelay = 0): number {
  return baseDelay + Math.max(0, index) * staggerDelay;
}

/**
 * Returns stagger configuration for parent motion components.
 */
export function stagger(delayChildren = 0.04, staggerChildren = 0.04) {
  return {
    delayChildren,
    staggerChildren,
  };
}
