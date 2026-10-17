/**
 * Pure CSS/WAAPI & requestAnimationFrame channel transition helpers for the Viewer.
 *
 * Strictly NO 'motion' package imports to keep the viewer bundle chunk lightweight.
 */

/**
 * Smoothly ramps video volume down to 0 over durationMs using requestAnimationFrame.
 * Returns the captured starting volume so it can be restored.
 */
export function rampVolumeDown(video: HTMLVideoElement, durationMs = 200): Promise<number> {
  return new Promise((resolve) => {
    const startVolume = video.volume;
    if (startVolume <= 0 || video.muted || durationMs <= 0 || typeof window === 'undefined') {
      video.volume = 0;
      resolve(startVolume);
      return;
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      video.volume = Math.max(0, startVolume * (1 - progress));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        video.volume = 0;
        resolve(startVolume);
      }
    }

    requestAnimationFrame(step);
  });
}

/**
 * Smoothly restores or ramps video volume up from 0 to targetVolume.
 */
export function restoreVolume(
  video: HTMLVideoElement,
  targetVolume: number,
  durationMs = 200,
): Promise<void> {
  return new Promise((resolve) => {
    const clampedTarget = Math.min(1, Math.max(0, targetVolume));
    if (clampedTarget <= 0 || video.muted || durationMs <= 0 || typeof window === 'undefined') {
      video.volume = clampedTarget;
      resolve();
      return;
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      video.volume = Math.min(clampedTarget, clampedTarget * progress);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        video.volume = clampedTarget;
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}
