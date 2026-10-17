import { useCallback, useEffect, useState } from 'react';

export type MotionMode = 'full' | 'lite' | 'reduced';
export type MotionPreference = 'auto' | 'full' | 'lite';

export interface MotionEnvironment {
  prefersReducedMotion?: boolean;
  storedPreference?: string | null;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/**
 * Pure resolver function for effective motion mode.
 *
 * Resolution order:
 * 1. Accessibility override: `prefers-reduced-motion: reduce` matches.
 *    This ALWAYS wins over a stored 'full', 'lite', or any user preference unconditionally.
 * 2. Explicit stored user choice from localStorage ('full' | 'lite').
 * 3. Auto resolution (when preference is 'auto' or unset):
 *    - 'lite' when navigator.hardwareConcurrency <= 4 or navigator.deviceMemory <= 2
 *      (Unverified heuristic: assumes <= 4 CPU cores or <= 2GB RAM is a low-power device).
 *    - 'full' otherwise.
 */
export function resolveMotionMode(env: MotionEnvironment = {}): MotionMode {
  // 1. Accessibility override: reduced motion ALWAYS wins unconditionally
  if (env.prefersReducedMotion) {
    return 'reduced';
  }

  // 2. Explicit user choice
  const pref = env.storedPreference;
  if (pref === 'full') {
    return 'full';
  }
  if (pref === 'lite') {
    return 'lite';
  }
  if (pref === 'reduced') {
    return 'reduced';
  }

  // 3. Auto resolution (when pref === 'auto' or not explicitly 'full'/'lite')
  // Heuristic (Unverified): lower-spec hardware benefits from lite motion to avoid frame drops during HLS decode
  if (
    typeof env.hardwareConcurrency === 'number' &&
    env.hardwareConcurrency > 0 &&
    env.hardwareConcurrency <= 4
  ) {
    return 'lite';
  }

  if (typeof env.deviceMemory === 'number' && env.deviceMemory > 0 && env.deviceMemory <= 2) {
    return 'lite';
  }

  return 'full';
}

/**
 * Safely reads the current runtime browser environment for motion mode resolution.
 * All browser API reads are wrapped in try/catch to protect against SSR, sandboxed iframes,
 * or restricted browser environments.
 */
export function getBrowserEnvironment(): MotionEnvironment {
  let prefersReducedMotion = false;
  let storedPreference: string | null = null;
  let hardwareConcurrency: number | undefined;
  let deviceMemory: number | undefined;

  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch {
    // Ignore matchMedia read errors
  }

  try {
    if (typeof localStorage !== 'undefined') {
      storedPreference = localStorage.getItem('motion');
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    if (typeof navigator !== 'undefined') {
      hardwareConcurrency = navigator.hardwareConcurrency;
      if ('deviceMemory' in navigator) {
        deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      }
    }
  } catch {
    // Ignore navigator read errors
  }

  return {
    prefersReducedMotion,
    storedPreference,
    hardwareConcurrency,
    deviceMemory,
  };
}

/**
 * Reflects the effective motion mode on document.documentElement.dataset.motion.
 */
export function applyMotionMode(mode: MotionMode): void {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.motion = mode;
    }
  } catch {
    // Ignore DOM modification errors
  }
}

/**
 * Retrieves the stored motion preference ('auto' | 'full' | 'lite').
 */
export function getStoredMotionPreference(): MotionPreference {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem('motion');
      if (val === 'full' || val === 'lite' || val === 'auto') {
        return val;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return 'auto';
}

/**
 * Sets and persists the motion preference in localStorage and notifies active listeners.
 */
export function setStoredMotionPreference(pref: MotionPreference): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('motion', pref);
    }
  } catch {
    // Ignore storage errors
  }

  // Re-apply effective mode immediately to document
  const effective = resolveMotionMode(getBrowserEnvironment());
  applyMotionMode(effective);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('niracast-motion-change', { detail: pref }));
  }
}

/**
 * Cycles through motion preferences in the order: 'auto' -> 'full' -> 'lite' -> 'auto'.
 */
export function getNextMotionPreference(current: MotionPreference): MotionPreference {
  switch (current) {
    case 'auto':
      return 'full';
    case 'full':
      return 'lite';
    default:
      return 'auto';
  }
}

// Immediate application on initial module evaluation in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  applyMotionMode(resolveMotionMode(getBrowserEnvironment()));
}

/**
 * React hook to observe and control motion mode.
 * Reacts to media query changes (prefers-reduced-motion) and cross-tab/intra-tab storage events.
 */
export function useMotionMode() {
  const [preference, setPreferenceState] = useState<MotionPreference>(getStoredMotionPreference);
  const [mode, setModeState] = useState<MotionMode>(() =>
    resolveMotionMode(getBrowserEnvironment()),
  );

  const sync = useCallback(() => {
    const nextPref = getStoredMotionPreference();
    const nextMode = resolveMotionMode(getBrowserEnvironment());
    setPreferenceState(nextPref);
    setModeState(nextMode);
    applyMotionMode(nextMode);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Apply initially on mount
    sync();

    // 1. Listen for system accessibility media-query changes
    let mql: MediaQueryList | null = null;
    try {
      if (typeof window.matchMedia === 'function') {
        mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', sync);
        } else if (typeof mql.addListener === 'function') {
          mql.addListener(sync);
        }
      }
    } catch {
      // Ignore media query listener errors
    }

    // 2. Listen for storage changes across tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'motion') {
        sync();
      }
    };
    window.addEventListener('storage', handleStorage);

    // 3. Listen for intra-tab custom change events
    const handleCustomChange = () => {
      sync();
    };
    window.addEventListener('niracast-motion-change', handleCustomChange);

    return () => {
      if (mql) {
        try {
          if (typeof mql.removeEventListener === 'function') {
            mql.removeEventListener('change', sync);
          } else if (typeof mql.removeListener === 'function') {
            mql.removeListener(sync);
          }
        } catch {
          // Ignore
        }
      }
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('niracast-motion-change', handleCustomChange);
    };
  }, [sync]);

  const setPreference = useCallback((pref: MotionPreference) => {
    setStoredMotionPreference(pref);
    setPreferenceState(pref);
    const effective = resolveMotionMode(getBrowserEnvironment());
    setModeState(effective);
    applyMotionMode(effective);
  }, []);

  const cyclePreference = useCallback(() => {
    const next = getNextMotionPreference(preference);
    setPreference(next);
  }, [preference, setPreference]);

  return {
    mode,
    preference,
    setPreference,
    cyclePreference,
  };
}
