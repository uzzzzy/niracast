import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Pure resolver function for effective theme.
 */
export function resolveTheme(pref: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (pref === 'light') {
    return 'light';
  }
  if (pref === 'dark') {
    return 'dark';
  }
  return prefersDark ? 'dark' : 'light';
}

/**
 * Safely reads the prefers-color-scheme: dark media query from window.
 */
function getSystemPrefersDark(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {
    // Ignore matchMedia errors
  }
  return true;
}

/**
 * Retrieves the stored theme preference ('system' | 'light' | 'dark').
 */
export function getStoredTheme(): ThemePreference {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem('theme');
      if (val === 'light' || val === 'dark' || val === 'system') {
        return val;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return 'system';
}

/**
 * Reflects the effective theme on document.documentElement.dataset.theme and dataset.themePref.
 */
export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const prefersDark = getSystemPrefersDark();
  const resolved = resolveTheme(pref, prefersDark);
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePref = pref;
    }
  } catch {
    // Ignore DOM modification errors
  }
  return resolved;
}

/**
 * Sets and persists the theme preference in localStorage and notifies active listeners.
 */
export function setStoredTheme(pref: ThemePreference): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', pref);
    }
  } catch {
    // Ignore storage write errors
  }

  applyTheme(pref);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tvstream-theme-change', { detail: pref }));
  }
}

// Immediate application on initial module evaluation in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  applyTheme(getStoredTheme());
}

/**
 * React hook to observe and control theme preference and resolved theme.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredTheme);
  const [resolved, setResolvedState] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme(), getSystemPrefersDark()),
  );

  const sync = useCallback(() => {
    const currentPref = getStoredTheme();
    const effective = applyTheme(currentPref);
    setPreferenceState(currentPref);
    setResolvedState(effective);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    sync();

    let mql: MediaQueryList | null = null;
    const handleMql = () => {
      if (getStoredTheme() === 'system') {
        sync();
      }
    };

    try {
      if (typeof window.matchMedia === 'function') {
        mql = window.matchMedia('(prefers-color-scheme: dark)');
        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', handleMql);
        } else if (typeof mql.addListener === 'function') {
          mql.addListener(handleMql);
        }
      }
    } catch {
      // Ignore media query errors
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'theme') {
        sync();
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleCustomChange = () => {
      sync();
    };
    window.addEventListener('tvstream-theme-change', handleCustomChange);

    return () => {
      if (mql) {
        try {
          if (typeof mql.removeEventListener === 'function') {
            mql.removeEventListener('change', handleMql);
          } else if (typeof mql.removeListener === 'function') {
            mql.removeListener(handleMql);
          }
        } catch {
          // Ignore
        }
      }
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tvstream-theme-change', handleCustomChange);
    };
  }, [sync]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setStoredTheme(pref);
    setPreferenceState(pref);
    setResolvedState(resolveTheme(pref, getSystemPrefersDark()));
  }, []);

  return {
    preference,
    resolved,
    setPreference,
  };
}
