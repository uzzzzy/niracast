import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMotionMode,
  getNextMotionPreference,
  getStoredMotionPreference,
  resolveMotionMode,
  setStoredMotionPreference,
  useMotionMode,
} from './mode';

describe('Motion Mode Resolver Truth Table', () => {
  it('reduced motion ALWAYS beats stored full unconditionally', () => {
    const mode = resolveMotionMode({
      prefersReducedMotion: true,
      storedPreference: 'full',
      hardwareConcurrency: 16,
      deviceMemory: 32,
    });
    expect(mode).toBe('reduced');
  });

  it('reduced motion beats stored lite unconditionally', () => {
    const mode = resolveMotionMode({
      prefersReducedMotion: true,
      storedPreference: 'lite',
    });
    expect(mode).toBe('reduced');
  });

  it('reduced motion beats auto unconditionally', () => {
    const mode = resolveMotionMode({
      prefersReducedMotion: true,
      storedPreference: 'auto',
    });
    expect(mode).toBe('reduced');
  });

  it('respects stored lite when reduced motion is false', () => {
    const mode = resolveMotionMode({
      prefersReducedMotion: false,
      storedPreference: 'lite',
      hardwareConcurrency: 16,
      deviceMemory: 16,
    });
    expect(mode).toBe('lite');
  });

  it('respects stored full when reduced motion is false', () => {
    const mode = resolveMotionMode({
      prefersReducedMotion: false,
      storedPreference: 'full',
      hardwareConcurrency: 2, // Even on low spec, user explicit full wins over auto heuristic
      deviceMemory: 1,
    });
    expect(mode).toBe('full');
  });

  it('auto mode resolves to lite when hardwareConcurrency <= 4', () => {
    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        storedPreference: 'auto',
        hardwareConcurrency: 4,
        deviceMemory: 8,
      }),
    ).toBe('lite');

    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        storedPreference: 'auto',
        hardwareConcurrency: 2,
        deviceMemory: 8,
      }),
    ).toBe('lite');
  });

  it('auto mode resolves to lite when deviceMemory <= 2', () => {
    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        storedPreference: 'auto',
        hardwareConcurrency: 8,
        deviceMemory: 2,
      }),
    ).toBe('lite');

    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        storedPreference: null,
        hardwareConcurrency: 8,
        deviceMemory: 1,
      }),
    ).toBe('lite');
  });

  it('auto mode resolves to full when specs exceed lite threshold', () => {
    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        storedPreference: 'auto',
        hardwareConcurrency: 8,
        deviceMemory: 8,
      }),
    ).toBe('full');

    expect(
      resolveMotionMode({
        prefersReducedMotion: false,
        storedPreference: null,
        hardwareConcurrency: 12,
        deviceMemory: 16,
      }),
    ).toBe('full');
  });

  it('handles empty environment safely and defaults to full', () => {
    expect(resolveMotionMode({})).toBe('full');
  });
});

describe('Motion Preference Storage & Cycling', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.motion;
  });

  it('cycles preferences in order: auto -> full -> lite -> auto', () => {
    expect(getNextMotionPreference('auto')).toBe('full');
    expect(getNextMotionPreference('full')).toBe('lite');
    expect(getNextMotionPreference('lite')).toBe('auto');
  });

  it('persists preference in localStorage and applies dataset.motion', () => {
    expect(getStoredMotionPreference()).toBe('auto');

    setStoredMotionPreference('lite');
    expect(localStorage.getItem('motion')).toBe('lite');
    expect(getStoredMotionPreference()).toBe('lite');
    expect(document.documentElement.dataset.motion).toBe('lite');

    setStoredMotionPreference('full');
    expect(localStorage.getItem('motion')).toBe('full');
    expect(getStoredMotionPreference()).toBe('full');
    expect(document.documentElement.dataset.motion).toBe('full');
  });

  it('applyMotionMode updates document.documentElement.dataset.motion', () => {
    applyMotionMode('reduced');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    applyMotionMode('lite');
    expect(document.documentElement.dataset.motion).toBe('lite');
    applyMotionMode('full');
    expect(document.documentElement.dataset.motion).toBe('full');
  });
});

describe('useMotionMode Hook', () => {
  let listeners: Array<() => void> = [];
  let matchesReduce = false;

  beforeEach(() => {
    localStorage.clear();
    listeners = [];
    matchesReduce = false;
    delete document.documentElement.dataset.motion;

    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('reduce') ? matchesReduce : false,
      media: query,
      onchange: null,
      addListener: (cb: () => void) => listeners.push(cb),
      removeListener: vi.fn(),
      addEventListener: (_event: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes and reflects effective mode on document.documentElement.dataset.motion', () => {
    const { result } = renderHook(() => useMotionMode());

    expect(result.current.mode).toBe('full');
    expect(document.documentElement.dataset.motion).toBe('full');
  });

  it('reacts to matchMedia change event and switches to reduced unconditionally', () => {
    const { result } = renderHook(() => useMotionMode());
    expect(result.current.mode).toBe('full');

    act(() => {
      matchesReduce = true;
      for (const listener of listeners) {
        listener();
      }
    });

    expect(result.current.mode).toBe('reduced');
    expect(document.documentElement.dataset.motion).toBe('reduced');
  });

  it('cycles preference through the hook and updates localStorage', () => {
    const { result } = renderHook(() => useMotionMode());

    expect(result.current.preference).toBe('auto');

    act(() => {
      result.current.cyclePreference();
    });
    expect(result.current.preference).toBe('full');
    expect(localStorage.getItem('motion')).toBe('full');

    act(() => {
      result.current.cyclePreference();
    });
    expect(result.current.preference).toBe('lite');
    expect(localStorage.getItem('motion')).toBe('lite');
    expect(document.documentElement.dataset.motion).toBe('lite');

    act(() => {
      result.current.cyclePreference();
    });
    expect(result.current.preference).toBe('auto');
    expect(localStorage.getItem('motion')).toBe('auto');
  });
});
