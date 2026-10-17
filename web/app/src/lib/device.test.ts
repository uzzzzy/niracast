import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyUiProfile, detectUiProfile, useUiProfile } from './device';

// Real-world Smart TV and Desktop User Agent strings
const UA_TIZEN =
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36';
const UA_WEBOS =
  'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
const UA_ANDROID_TV =
  'Mozilla/5.0 (Linux; Android 10; BRAVIA 4K VH2 Build/QTG3.200305.001.S34) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36';
const UA_CHROMECAST =
  'Mozilla/5.0 (CrKey armv7l 1.56.500000) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36';
const UA_FIRE_TV =
  'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7273; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/113.0.5672.136 Mobile Safari/537.36';
const UA_DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const UA_DESKTOP_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
const UA_DESKTOP_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';

// Real-world Mobile and Tablet User Agent strings
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
const UA_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const UA_ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240205.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36';
const UA_ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X906B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

describe('detectUiProfile', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.ui;
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.ui;
  });

  it('detects TV profile for Tizen UA', () => {
    expect(detectUiProfile(UA_TIZEN, '', null)).toBe('tv');
  });

  it('detects TV profile for webOS UA', () => {
    expect(detectUiProfile(UA_WEBOS, '', null)).toBe('tv');
  });

  it('detects TV profile for Android TV (Bravia) UA (TV still wins)', () => {
    expect(detectUiProfile(UA_ANDROID_TV, '', null)).toBe('tv');
  });

  it('detects TV profile for Chromecast (CrKey) UA', () => {
    expect(detectUiProfile(UA_CHROMECAST, '', null)).toBe('tv');
  });

  it('detects TV profile for Fire TV (AFTMM) UA', () => {
    expect(detectUiProfile(UA_FIRE_TV, '', null)).toBe('tv');
  });

  it('detects Mobile profile for real iPhone UA', () => {
    expect(detectUiProfile(UA_IPHONE, '', null)).toBe('mobile');
  });

  it('detects Mobile profile for real Android phone UA', () => {
    expect(detectUiProfile(UA_ANDROID_PHONE, '', null)).toBe('mobile');
  });

  it('detects Mobile profile for real iPad UA', () => {
    expect(detectUiProfile(UA_IPAD, '', null)).toBe('mobile');
  });

  it('detects Mobile profile for real Android tablet UA', () => {
    expect(detectUiProfile(UA_ANDROID_TABLET, '', null)).toBe('mobile');
  });

  it('detects Mobile profile for iPad in desktop mode with touch points', () => {
    expect(
      detectUiProfile(UA_IPAD_DESKTOP_MODE, '', null, {
        width: 1024,
        height: 768,
        hasTouch: true,
      }),
    ).toBe('mobile');
  });

  it('detects Mobile profile for small viewport width < 768 with coarse pointer or touch', () => {
    expect(
      detectUiProfile(UA_DESKTOP_CHROME, '', null, {
        width: 390,
        height: 844,
        pointerCoarse: true,
      }),
    ).toBe('mobile');

    expect(
      detectUiProfile(UA_DESKTOP_CHROME, '', null, {
        width: 320,
        height: 568,
        hasTouch: true,
      }),
    ).toBe('mobile');
  });

  it('detects Desktop profile for Chrome desktop UA', () => {
    expect(detectUiProfile(UA_DESKTOP_CHROME, '', null)).toBe('desktop');
  });

  it('detects Desktop profile for Firefox desktop UA', () => {
    expect(detectUiProfile(UA_DESKTOP_FIREFOX, '', null)).toBe('desktop');
  });

  it('detects Desktop profile for Safari desktop UA', () => {
    expect(detectUiProfile(UA_DESKTOP_SAFARI, '', null)).toBe('desktop');
  });

  it('honors query parameter ?ui=tv over mobile UA and persists to storage', () => {
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
    };

    const result = detectUiProfile(UA_IPHONE, '?ui=tv', storage);
    expect(result).toBe('tv');
    expect(mockStorage.ui).toBe('tv');
  });

  it('honors query parameter ?ui=desktop to force back over mobile UA and persists', () => {
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
    };

    const result = detectUiProfile(UA_IPHONE, '?ui=desktop', storage);
    expect(result).toBe('desktop');
    expect(mockStorage.ui).toBe('desktop');
  });

  it('honors query parameter ?ui=mobile to force mobile profile over desktop UA and persists', () => {
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
    };

    const result = detectUiProfile(UA_DESKTOP_CHROME, '?ui=mobile', storage);
    expect(result).toBe('mobile');
    expect(mockStorage.ui).toBe('mobile');
  });

  it('reads stored preference from storage when query param is absent', () => {
    const tvStorage = {
      getItem: (key: string) => (key === 'ui' ? 'tv' : null),
    };
    expect(detectUiProfile(UA_DESKTOP_CHROME, '', tvStorage)).toBe('tv');

    const mobileStorage = {
      getItem: (key: string) => (key === 'ui' ? 'mobile' : null),
    };
    expect(detectUiProfile(UA_DESKTOP_CHROME, '', mobileStorage)).toBe('mobile');

    const desktopStorage = {
      getItem: (key: string) => (key === 'ui' ? 'desktop' : null),
    };
    expect(detectUiProfile(UA_IPHONE, '', desktopStorage)).toBe('desktop');
  });
});

describe('useUiProfile and applyUiProfile', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.ui;
  });

  it('applies ui profile to document.documentElement.dataset.ui', () => {
    applyUiProfile('tv');
    expect(document.documentElement.dataset.ui).toBe('tv');

    applyUiProfile('mobile');
    expect(document.documentElement.dataset.ui).toBe('mobile');

    applyUiProfile('desktop');
    expect(document.documentElement.dataset.ui).toBe('desktop');
  });

  it('sets document.documentElement.dataset.ui through useUiProfile hook', () => {
    localStorage.setItem('ui', 'mobile');
    const { result } = renderHook(() => useUiProfile());

    expect(result.current).toBe('mobile');
    expect(document.documentElement.dataset.ui).toBe('mobile');
  });
});
