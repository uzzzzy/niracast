import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStoredAudio,
  getStoredMuted,
  getStoredVolume,
  MUTED_KEY,
  setStoredMuted,
  setStoredVolume,
  VOLUME_KEY,
} from './volumePersistence';

describe('volumePersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to volume 1 and muted false when localStorage is empty', () => {
    expect(getStoredVolume()).toBe(1);
    expect(getStoredMuted()).toBe(false);
  });

  it('persists and retrieves custom volume', () => {
    setStoredVolume(0.45);
    expect(localStorage.getItem(VOLUME_KEY)).toBe('0.45');
    expect(getStoredVolume()).toBe(0.45);

    // Clamps out-of-range volume
    setStoredVolume(1.5);
    expect(getStoredVolume()).toBe(1);

    setStoredVolume(-0.2);
    expect(getStoredVolume()).toBe(0);
  });

  it('persists and retrieves muted state', () => {
    setStoredMuted(true);
    expect(localStorage.getItem(MUTED_KEY)).toBe('true');
    expect(getStoredMuted()).toBe(true);

    setStoredMuted(false);
    expect(localStorage.getItem(MUTED_KEY)).toBe('false');
    expect(getStoredMuted()).toBe(false);
  });

  it('applies stored volume and muted to video element', () => {
    setStoredVolume(0.35);
    setStoredMuted(true);

    const video = document.createElement('video');
    applyStoredAudio(video);

    expect(video.volume).toBeCloseTo(0.35);
    expect(video.muted).toBe(true);
  });
});
