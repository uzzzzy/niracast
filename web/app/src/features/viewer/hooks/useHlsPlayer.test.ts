import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, useHlsPlayer } from './useHlsPlayer';

// Mock instance tracking
let mockHlsInstances: Array<{
  on: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  loadSource: ReturnType<typeof vi.fn>;
  startLoad: ReturnType<typeof vi.fn>;
  recoverMediaError: ReturnType<typeof vi.fn>;
  swapAudioCodec: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  callbacks: Record<string, ((...args: unknown[]) => void)[]>;
}> = [];

vi.mock('hls.js', () => {
  class MockHls {
    static isSupported = vi.fn(() => true);
    static Events = {
      MEDIA_ATTACHED: 'hlsMediaAttached',
      MANIFEST_PARSED: 'hlsManifestParsed',
      ERROR: 'hlsError',
    };
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
      OTHER_ERROR: 'otherError',
    };
    static ErrorDetails = {
      BUFFER_STALLED_ERROR: 'bufferStalledError',
      MANIFEST_LOAD_ERROR: 'manifestLoadError',
    };

    callbacks: Record<string, ((...args: unknown[]) => void)[]> = {};
    on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!this.callbacks[event]) this.callbacks[event] = [];
      this.callbacks[event].push(cb);
    });
    attachMedia = vi.fn();
    loadSource = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    swapAudioCodec = vi.fn();
    destroy = vi.fn();

    constructor() {
      mockHlsInstances.push(this);
    }
  }

  return {
    default: MockHls,
  };
});

describe('backoffDelay', () => {
  it('computes 1s, 2s, 4s, 8s, max 15s schedule', () => {
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(3)).toBe(8000);
    expect(backoffDelay(4)).toBe(15000);
    expect(backoffDelay(5)).toBe(15000);
    expect(backoffDelay(10)).toBe(15000);
  });
});

describe('useHlsPlayer', () => {
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    vi.useFakeTimers();
    mockHlsInstances = [];
    mockVideo = document.createElement('video');
    mockVideo.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('switches phase loading -> playing on mocked events', () => {
    const { result } = renderHook(() => useHlsPlayer(mockVideo, '/channels/1/live.m3u8'));

    expect(result.current.phase).toBe('loading');
    expect(mockHlsInstances.length).toBe(1);
    const hls = mockHlsInstances[0];

    // Trigger manifest parsed
    act(() => {
      const parsedCallbacks = hls.callbacks.hlsManifestParsed || [];
      for (const cb of parsedCallbacks) {
        cb('hlsManifestParsed', {});
      }
    });

    // Simulate video playing event
    act(() => {
      mockVideo.dispatchEvent(new Event('playing'));
    });

    expect(result.current.phase).toBe('playing');
    expect(result.current.errorMessage).toBeNull();
  });

  it('handles autoplay rejection by falling back to muted playback and setting needsUnmute', async () => {
    let playCallCount = 0;
    mockVideo.play = vi.fn().mockImplementation(() => {
      playCallCount += 1;
      if (playCallCount === 1) {
        return Promise.reject(new Error('NotAllowedError'));
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useHlsPlayer(mockVideo, '/channels/1/live.m3u8'));
    const hls = mockHlsInstances[0];

    await act(async () => {
      const parsedCallbacks = hls.callbacks.hlsManifestParsed || [];
      for (const cb of parsedCallbacks) {
        cb('hlsManifestParsed', {});
      }
      await Promise.resolve();
    });

    expect(mockVideo.muted).toBe(true);
    expect(result.current.needsUnmute).toBe(true);
  });

  it('performs exponential backoff on fatal network errors', () => {
    renderHook(() => useHlsPlayer(mockVideo, '/channels/1/live.m3u8'));
    const hls = mockHlsInstances[0];

    const errorCallbacks = hls.callbacks.hlsError || [];

    // Trigger first fatal network error
    act(() => {
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'networkError',
          details: 'manifestLoadError',
        });
      }
    });

    expect(hls.startLoad).not.toHaveBeenCalled();

    // Fast-forward 1s (backoff 0 = 1000ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hls.startLoad).toHaveBeenCalledTimes(1);

    // Trigger second fatal network error
    act(() => {
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'networkError',
          details: 'manifestLoadError',
        });
      }
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Should not have fired yet because delay is 2000ms
    expect(hls.startLoad).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hls.startLoad).toHaveBeenCalledTimes(2);
  });

  it('recovers media errors by recovering then swapping audio codec on second failure', () => {
    const { result } = renderHook(() => useHlsPlayer(mockVideo, '/channels/1/live.m3u8'));
    const hls = mockHlsInstances[0];
    const errorCallbacks = hls.callbacks.hlsError || [];

    // First fatal media error
    act(() => {
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'mediaError',
          details: 'bufferStalledError',
        });
      }
    });
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(hls.swapAudioCodec).not.toHaveBeenCalled();

    // Second fatal media error
    act(() => {
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'mediaError',
          details: 'bufferStalledError',
        });
      }
    });
    expect(hls.swapAudioCodec).toHaveBeenCalledTimes(1);
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(2);

    // Third fatal media error -> goes to error phase
    act(() => {
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'mediaError',
          details: 'unrecoverableBuffer',
        });
      }
    });
    expect(result.current.phase).toBe('error');
    expect(result.current.errorMessage).toBe('unrecoverableBuffer');
  });

  it('recreates Hls on other fatal error, then goes to error phase if it fails again', () => {
    const { result } = renderHook(() => useHlsPlayer(mockVideo, '/channels/1/live.m3u8'));
    expect(mockHlsInstances.length).toBe(1);
    const firstHls = mockHlsInstances[0];

    // First fatal other error: destroys and recreates once
    act(() => {
      const errorCallbacks = firstHls.callbacks.hlsError || [];
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'otherError',
          details: 'internalException',
        });
      }
    });

    expect(firstHls.destroy).toHaveBeenCalledTimes(1);
    expect(mockHlsInstances.length).toBe(2);
    expect(result.current.phase).toBe('loading');

    const secondHls = mockHlsInstances[1];
    // Second fatal other error: phase becomes error
    act(() => {
      const errorCallbacks = secondHls.callbacks.hlsError || [];
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: true,
          type: 'otherError',
          details: 'repeatedFatalError',
        });
      }
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.errorMessage).toBe('repeatedFatalError');

    // Test retry()
    act(() => {
      result.current.retry();
    });
    expect(result.current.phase).toBe('loading');
    expect(result.current.errorMessage).toBeNull();
  });

  it('ignores non-fatal errors like buffer stalls and discontinuities', () => {
    const { result } = renderHook(() => useHlsPlayer(mockVideo, '/channels/1/live.m3u8'));
    const hls = mockHlsInstances[0];

    act(() => {
      const errorCallbacks = hls.callbacks.hlsError || [];
      for (const cb of errorCallbacks) {
        cb('hlsError', {
          fatal: false,
          type: 'mediaError',
          details: 'bufferStalledError',
        });
      }
    });

    expect(result.current.phase).toBe('loading');
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(hls.destroy).not.toHaveBeenCalled();
  });

  it('initializes HLS when video element mounts late (transitions from null to element)', () => {
    let video: HTMLVideoElement | null = null;
    const { rerender } = renderHook(() => useHlsPlayer(video, '/channels/1/live.m3u8'));

    expect(mockHlsInstances.length).toBe(0);

    video = mockVideo;
    rerender();

    expect(mockHlsInstances.length).toBe(1);
    expect(mockHlsInstances[0].attachMedia).toHaveBeenCalledWith(mockVideo);
  });
});
