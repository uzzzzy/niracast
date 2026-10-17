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

  it('detects TV profile for Android TV (Bravia) UA', () => {
    expect(detectUiProfile(UA_ANDROID_TV, '', null)).toBe('tv');
  });

  it('detects TV profile for Chromecast (CrKey) UA', () => {
    expect(detectUiProfile(UA_CHROMECAST, '', null)).toBe('tv');
  });

  it('detects TV profile for Fire TV (AFTMM) UA', () => {
    expect(detectUiProfile(UA_FIRE_TV, '', null)).toBe('tv');
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

  it('honors query parameter ?ui=tv over desktop UA and persists to storage', () => {
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
    };

    const result = detectUiProfile(UA_DESKTOP_CHROME, '?ui=tv', storage);
    expect(result).toBe('tv');
    expect(mockStorage.ui).toBe('tv');
  });

  it('honors query parameter ?ui=desktop to force back over TV UA and persists', () => {
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
    };

    const result = detectUiProfile(UA_TIZEN, '?ui=desktop', storage);
    expect(result).toBe('desktop');
    expect(mockStorage.ui).toBe('desktop');
  });

  it('reads stored preference from storage when query param is absent', () => {
    const storage = {
      getItem: (key: string) => (key === 'ui' ? 'tv' : null),
    };
    expect(detectUiProfile(UA_DESKTOP_CHROME, '', storage)).toBe('tv');

    const desktopStorage = {
      getItem: (key: string) => (key === 'ui' ? 'desktop' : null),
    };
    expect(detectUiProfile(UA_TIZEN, '', desktopStorage)).toBe('desktop');
  });

  it('falls back to desktop for unknown or mobile query param until phase 8', () => {
    expect(detectUiProfile(UA_DESKTOP_CHROME, '?ui=mobile', null)).toBe('desktop');
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

    applyUiProfile('desktop');
    expect(document.documentElement.dataset.ui).toBe('desktop');
  });

  it('sets document.documentElement.dataset.ui through useUiProfile hook', () => {
    localStorage.setItem('ui', 'tv');
    const { result } = renderHook(() => useUiProfile());

    expect(result.current).toBe('tv');
    expect(document.documentElement.dataset.ui).toBe('tv');
  });
});
