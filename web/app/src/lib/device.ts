import { useEffect, useState } from 'react';

export type UiProfile = 'tv' | 'mobile' | 'desktop';

export interface ViewportDimensions {
  width: number;
  height: number;
  pointerCoarse?: boolean;
  hasTouch?: boolean;
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
 * Regex matching mobile phone and tablet user agents:
 * iPhone, iPad, iPod, Android (phones/tablets), Mobile, Tablet.
 */
const MOBILE_UA_REGEX = /(iPhone|iPad|iPod|Android|Mobile|Tablet)/i;

/**
 * Pure function to detect the active UI profile ('tv' | 'mobile' | 'desktop').
 *
 * Precedence:
 * 1. Query parameter ?ui=tv | ?ui=desktop | ?ui=mobile (persists to storage when present).
 * 2. Stored preference in storage ('ui' = 'tv' | 'desktop' | 'mobile').
 * 3. User agent matching Smart TV families (TV still wins).
 * 4. User agent matching mobile phones / tablets.
 * 5. Coarse pointer + width < 768, touch, or iPad on desktop UA with touch.
 * 6. Fallback to 'desktop'.
 */
export function detectUiProfile(
  userAgent?: string,
  search?: string,
  storage?: StorageLike | null,
  viewport?: ViewportDimensions,
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
      return 'mobile';
    }
  }

  // 2. Storage preference ('ui' = 'tv' | 'desktop' | 'mobile')
  if (storage) {
    try {
      const stored = storage.getItem('ui');
      if (stored === 'tv') {
        return 'tv';
      }
      if (stored === 'desktop') {
        return 'desktop';
      }
      if (stored === 'mobile') {
        return 'mobile';
      }
    } catch {
      // Ignore storage read errors
    }
  }

  // 3. Smart TV User Agent inspection (TV still wins)
  const effectiveUa = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (effectiveUa && TV_UA_REGEX.test(effectiveUa)) {
    return 'tv';
  }

  // 4. Mobile User Agent inspection (phones and tablets)
  if (effectiveUa && MOBILE_UA_REGEX.test(effectiveUa)) {
    return 'mobile';
  }

  // 5. Coarse pointer + width < 768, touch, or iPad on desktop UA with touch
  const width = viewport?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const pointerCoarse =
    viewport?.pointerCoarse ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches);
  const hasTouch =
    viewport?.hasTouch ??
    (typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 ||
        (typeof window !== 'undefined' && 'ontouchstart' in window)));

  // iPad desktop UA override (Macintosh + touch points > 1)
  if (
    effectiveUa.includes('Macintosh') &&
    (viewport?.hasTouch || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1))
  ) {
    return 'mobile';
  }

  if ((pointerCoarse || hasTouch) && width < 768) {
    return 'mobile';
  }

  // 6. Default fallback
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
 * Helper to get current browser viewport and input info.
 */
function getBrowserViewport(): ViewportDimensions | undefined {
  if (typeof window === 'undefined') return undefined;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    pointerCoarse:
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    hasTouch:
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 || 'ontouchstart' in window),
  };
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
    const viewport = getBrowserViewport();

    const detected = detectUiProfile(ua, search, storage, viewport);
    applyUiProfile(detected);
    return detected;
  });

  useEffect(() => {
    applyUiProfile(profile);

    const updateProfile = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      const viewport = getBrowserViewport();

      const next = detectUiProfile(ua, search, storage, viewport);
      setProfile(next);
      applyUiProfile(next);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ui') {
        updateProfile();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('resize', updateProfile);
    window.addEventListener('orientationchange', updateProfile);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('resize', updateProfile);
      window.removeEventListener('orientationchange', updateProfile);
    };
  }, [profile]);

  return profile;
}
