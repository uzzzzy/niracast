import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLanguage, t, translations } from './i18n';

describe('i18n', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('defaults to Indonesian (id)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'fr-FR' },
      configurable: true,
      writable: true,
    });
    expect(getLanguage()).toBe('id');
    expect(t('live')).toBe('LIVE');
    expect(t('idle_title')).toBe('Siaran Segera Kembali');
  });

  it('uses localStorage lang when set', () => {
    localStorage.setItem('lang', 'en');
    expect(getLanguage()).toBe('en');
    expect(t('idle_title')).toBe("We'll be right back");
  });

  it('detects English from navigator.language when localStorage is empty', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-US' },
      configurable: true,
      writable: true,
    });
    expect(getLanguage()).toBe('en');
    expect(t('idle_title')).toBe("We'll be right back");
  });

  it('falls back to id when language is unknown or unsupported', () => {
    // Explicitly pass unsupported language string to t()
    expect(t('idle_title', 'de')).toBe('Siaran Segera Kembali');
  });

  it('has identical keys in id and en dictionaries', () => {
    const idKeys = Object.keys(translations.id).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(idKeys).toEqual(enKeys);
  });
});
