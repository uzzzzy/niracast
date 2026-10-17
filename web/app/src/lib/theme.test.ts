import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getStoredTheme, resolveTheme, setStoredTheme, useTheme } from './theme';

describe('Theme Resolution (Pure)', () => {
  it('resolves dark preference to dark regardless of system preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('resolves light preference to light regardless of system preference', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('resolves system preference based on prefersDark flag', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('Theme Storage', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePref;
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem('theme', 'light');
    expect(getStoredTheme()).toBe('light');

    localStorage.setItem('theme', 'dark');
    expect(getStoredTheme()).toBe('dark');

    localStorage.setItem('theme', 'system');
    expect(getStoredTheme()).toBe('system');
  });

  it('handles storage read failure or invalid value by falling back to system', () => {
    localStorage.setItem('theme', 'invalid-value');
    expect(getStoredTheme()).toBe('system');

    const originalGetItem = localStorage.getItem;
    localStorage.getItem = vi.fn().mockImplementation(() => {
      throw new Error('Access denied');
    });

    expect(getStoredTheme()).toBe('system');
    localStorage.getItem = originalGetItem;
  });

  it('persists preference with setStoredTheme', () => {
    setStoredTheme('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePref).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePref;
  });

  it('sets dataset.theme and dataset.themePref on documentElement', () => {
    const resolvedLight = applyTheme('light');
    expect(resolvedLight).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePref).toBe('light');

    const resolvedDark = applyTheme('dark');
    expect(resolvedDark).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePref).toBe('dark');
  });
});

describe('useTheme Hook', () => {
  let listeners: Array<() => void> = [];
  let matchesDark = true;

  beforeEach(() => {
    localStorage.clear();
    listeners = [];
    matchesDark = true;
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePref;

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? matchesDark : false,
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

  it('initializes with default system preference and reflects on documentElement', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('system');
    expect(result.current.resolved).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePref).toBe('system');
  });

  it('reacts to setPreference updating preference, resolved value, and dataset', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPreference('light');
    });

    expect(result.current.preference).toBe('light');
    expect(result.current.resolved).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePref).toBe('light');

    act(() => {
      result.current.setPreference('dark');
    });

    expect(result.current.preference).toBe('dark');
    expect(result.current.resolved).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePref).toBe('dark');
  });

  it('reacts to system matchMedia changes when preference is system', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('dark');

    act(() => {
      matchesDark = false;
      for (const listener of listeners) {
        listener();
      }
    });

    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
