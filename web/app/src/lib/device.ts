import { useEffect, useState } from 'react';

export type UiProfile = 'tv' | 'mobile' | 'desktop';

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

/**
 * Regex matching Smart TV user agent families:
 * SMART-TV, SmartTV, Tizen, Web0S/WebOS, NetCast, HbbTV,
 * Android TV / AFT* (Amazon Fire TV) / BRAVIA / Philips / Vestel / Hisense / VIDAA,
 * CrKey (Chromecast), Roku, PlayStation, Xbox, AppleTV.
 */
const TV_UA_REGEX =
  /(SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|HbbTV|Android TV|AFT[A-Za-z0-9_]*|BRAVIA|Philips|Vestel|Hisense|VIDAA|CrKey|Roku|PlayStation|Xbox|AppleTV)/i;

/**
 * Pure function to detect the active UI profile ('tv' | 'mobile' | 'desktop').
 *
 * Precedence:
 * 1. Query parameter ?ui=tv or ?ui=desktop (persists to storage when present).
 * 2. Stored preference in storage ('ui' = 'tv' | 'desktop').
 * 3. User agent matching Smart TV families.
 * 4. Fallback to 'desktop' (Phase 8 will add 'mobile').
 */
export function detectUiProfile(
  userAgent?: string,
  search?: string,
  storage?: StorageLike | null,
  _viewport?: ViewportDimensions,
): UiProfile {
  // 1. Query parameter (?ui=tv | ?ui=desktop | ?ui=mobile)
  if (typeof search === 'string' && search.length > 0) {
    const queryString = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(queryString);
    const uiParam = params.get('ui');

    if (uiParam === 'tv') {
      try {
        storage?.setItem?.('ui', 'tv');
      } catch {
        // Ignore storage write errors
      }
      return 'tv';
    }

    if (uiParam === 'desktop') {
      try {
        storage?.setItem?.('ui', 'desktop');
      } catch {
        // Ignore storage write errors
      }
      return 'desktop';
    }

    if (uiParam === 'mobile') {
      try {
        storage?.setItem?.('ui', 'mobile');
      } catch {
        // Ignore storage write errors
      }
      // Phase 8 will add mobile; design type as 'tv' | 'mobile' | 'desktop', return desktop for now
      return 'desktop';
    }
  }

  // 2. Storage preference ('ui' = 'tv' | 'desktop')
  if (storage) {
    try {
      const stored = storage.getItem('ui');
      if (stored === 'tv') {
        return 'tv';
      }
      if (stored === 'desktop') {
        return 'desktop';
      }
      // 'mobile' stored falls back to 'desktop' in Phase 7
    } catch {
      // Ignore storage read errors
    }
  }

  // 3. Smart TV User Agent inspection
  const effectiveUa = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (effectiveUa && TV_UA_REGEX.test(effectiveUa)) {
    return 'tv';
  }

  // 4. Default fallback
  return 'desktop';
}

/**
 * Applies the detected UI profile to document.documentElement.dataset.ui.
 */
export function applyUiProfile(profile: UiProfile): void {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.ui = profile;
    }
  } catch {
    // Ignore DOM modification errors in non-browser contexts
  }
}

/**
 * React hook to detect and apply the UI profile.
 * Sets document.documentElement.dataset.ui and returns the profile.
 */
export function useUiProfile(): UiProfile {
  const [profile, setProfile] = useState<UiProfile>(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    const viewport =
      typeof window !== 'undefined'
        ? { width: window.innerWidth, height: window.innerHeight }
        : undefined;

    const detected = detectUiProfile(ua, search, storage, viewport);
    applyUiProfile(detected);
    return detected;
  });

  useEffect(() => {
    applyUiProfile(profile);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ui') {
        const next = detectUiProfile(navigator.userAgent, window.location.search, localStorage);
        setProfile(next);
        applyUiProfile(next);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [profile]);

  return profile;
}
