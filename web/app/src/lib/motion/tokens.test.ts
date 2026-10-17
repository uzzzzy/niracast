import { describe, expect, it } from 'vitest';
import { DURATION, EASE, getStaggerDelay, SPRING, stagger } from './tokens';

describe('Motion Tokens', () => {
  it('durations are in strictly ascending order: fast < normal < slow', () => {
    expect(DURATION.fast).toBeLessThan(DURATION.normal);
    expect(DURATION.normal).toBeLessThan(DURATION.slow);
    expect(DURATION.fast).toBe(0.12);
    expect(DURATION.normal).toBe(0.24);
    expect(DURATION.slow).toBe(0.35);
  });

  it('spring ease is a cubic-bezier curve of exactly 4 numbers', () => {
    expect(EASE.spring).toHaveLength(4);
    expect(EASE.spring).toEqual([0.16, 1, 0.3, 1]);
    for (const val of EASE.spring) {
      expect(typeof val).toBe('number');
    }
  });

  it('spring physics presets are defined with valid stiffness and damping', () => {
    expect(SPRING.soft.stiffness).toBe(300);
    expect(SPRING.soft.damping).toBe(30);

    expect(SPRING.snappy.stiffness).toBeGreaterThan(SPRING.soft.stiffness);
    expect(SPRING.snappy.damping).toBeGreaterThan(SPRING.soft.damping);

    expect(SPRING.gentle.stiffness).toBeLessThan(SPRING.soft.stiffness);
  });

  it('getStaggerDelay calculates linear delay offset correctly', () => {
    expect(getStaggerDelay(0, 0.04, 0)).toBe(0);
    expect(getStaggerDelay(1, 0.04, 0)).toBeCloseTo(0.04);
    expect(getStaggerDelay(3, 0.05, 0.1)).toBeCloseTo(0.25);
  });

  it('stagger returns configuration for parent motion components', () => {
    const config = stagger(0.05, 0.05);
    expect(config.delayChildren).toBe(0.05);
    expect(config.staggerChildren).toBe(0.05);
  });
});
