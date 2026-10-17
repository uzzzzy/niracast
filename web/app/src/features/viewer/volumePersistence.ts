/**
 * Volume and Mute State Persistence for the Linear TV Viewer.
 *
 * Persists user volume and mute states across channel transitions and video remounts
 * via localStorage keys: 'viewer.volume' and 'viewer.muted'.
 */

export const VOLUME_KEY = 'viewer.volume';
export const MUTED_KEY = 'viewer.muted';

export function getStoredVolume(): number {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(VOLUME_KEY);
      if (val !== null) {
        const parsed = Number.parseFloat(val);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return 1;
}

export function getStoredMuted(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(MUTED_KEY);
      if (val !== null) {
        return val === 'true';
      }
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

export function setStoredVolume(volume: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const clamped = Math.min(1, Math.max(0, volume));
      localStorage.setItem(VOLUME_KEY, String(clamped));
    }
  } catch {
    // Ignore storage errors
  }
}

export function setStoredMuted(muted: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTED_KEY, String(muted));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Re-applies the stored volume and mute states to a newly mounted video element.
 */
export function applyStoredAudio(video: HTMLVideoElement | null): void {
  if (!video) return;
  try {
    video.volume = getStoredVolume();
    video.muted = getStoredMuted();
  } catch {
    // Ignore media element property access errors
  }
}
