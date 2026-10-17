import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rampVolumeDown, restoreVolume } from './channelTransition';

describe('Viewer Channel Transition Volume Helpers', () => {
  let mockRafCallbacks: Array<(time: number) => void> = [];
  let currentTime = 0;

  beforeEach(() => {
    mockRafCallbacks = [];
    currentTime = 1000;

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      mockRafCallbacks.push(cb);
      return mockRafCallbacks.length;
    });

    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushRaf(advanceMs: number) {
    currentTime += advanceMs;
    const callbacks = [...mockRafCallbacks];
    mockRafCallbacks = [];
    for (const cb of callbacks) {
      cb(currentTime);
    }
  }

  it('rampVolumeDown ramps volume to 0 over 200ms and returns initial volume', async () => {
    const video = document.createElement('video');
    video.volume = 0.8;

    const promise = rampVolumeDown(video, 200);

    // Step halfway (100ms)
    flushRaf(100);
    expect(video.volume).toBeCloseTo(0.4, 1);

    // Complete duration (another 100ms)
    flushRaf(100);
    const initialVolume = await promise;

    expect(video.volume).toBe(0);
    expect(initialVolume).toBe(0.8);
  });

  it('restoreVolume ramps volume back to target volume over 200ms', async () => {
    const video = document.createElement('video');
    video.volume = 0;

    const promise = restoreVolume(video, 0.8, 200);

    // Step halfway (100ms)
    flushRaf(100);
    expect(video.volume).toBeCloseTo(0.4, 1);

    // Complete duration (another 100ms)
    flushRaf(100);
    await promise;

    expect(video.volume).toBeCloseTo(0.8, 2);
  });

  it('handles already-muted or zero volume video immediately', async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.volume = 0.5;

    const initial = await rampVolumeDown(video, 200);
    expect(initial).toBe(0.5);

    await restoreVolume(video, 0.5, 200);
    expect(video.volume).toBe(0.5);
  });
});
