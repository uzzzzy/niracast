import Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';

export type PlayerPhase = 'loading' | 'playing' | 'buffering' | 'error';

export function backoffDelay(attempt: number): number {
  const n = Math.max(0, attempt);
  return Math.min(1000 * 2 ** n, 15000);
}

export interface UseHlsPlayerResult {
  phase: PlayerPhase;
  errorMessage: string | null;
  retry: () => void;
  needsUnmute: boolean;
}

export function useHlsPlayer(
  video: HTMLVideoElement | null,
  src: string | null | undefined,
): UseHlsPlayerResult {
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const hlsRef = useRef<Hls | null>(null);
  const networkRetryCount = useRef(0);
  const mediaRecoveryCount = useRef(0);
  const otherRecoveryCount = useRef(0);
  const networkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNetworkTimer = useCallback(() => {
    if (networkTimerRef.current !== null) {
      clearTimeout(networkTimerRef.current);
      networkTimerRef.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    networkRetryCount.current = 0;
    mediaRecoveryCount.current = 0;
    otherRecoveryCount.current = 0;
    clearNetworkTimer();
    setErrorMessage(null);
    setPhase('loading');
    setRetryKey((k) => k + 1);
  }, [clearNetworkTimer]);

  useEffect(() => {
    // Acknowledge retryKey to trigger reinitialization on retry()
    if (retryKey < 0) return;

    if (!video || !src) {
      setPhase('loading');
      return;
    }

    let isDisposed = false;
    clearNetworkTimer();

    const attemptAutoplay = () => {
      if (isDisposed) return;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (isDisposed) return;
          // Autoplay blocked: mute and retry playback
          video.muted = true;
          video
            .play()
            .then(() => {
              if (!isDisposed) {
                setNeedsUnmute(true);
              }
            })
            .catch(() => {
              // Muted play also failed or paused
            });
        });
      }
    };

    const handlePlaying = () => {
      if (!isDisposed) {
        setPhase('playing');
        setErrorMessage(null);
        networkRetryCount.current = 0;
      }
    };

    const handleWaiting = () => {
      if (!isDisposed) {
        setPhase((current) => (current === 'playing' ? 'buffering' : current));
      }
    };

    const handleCanPlay = () => {
      if (!isDisposed) {
        setPhase((current) => (current === 'buffering' ? 'playing' : current));
      }
    };

    const handleVolumeChange = () => {
      if (!isDisposed && !video.muted) {
        setNeedsUnmute(false);
      }
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('volumechange', handleVolumeChange);

    // Branch 1: Hls.js supported
    if (Hls.isSupported()) {
      const createHlsInstance = (): Hls => {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (!isDisposed && src) {
            hls.loadSource(src);
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isDisposed) {
            attemptAutoplay();
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (isDisposed) return;

          // Non-fatal errors (e.g. buffer stalls, discontinuities) should be handled gracefully
          if (!data.fatal) {
            return;
          }

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: {
              const delay = backoffDelay(networkRetryCount.current);
              networkRetryCount.current += 1;
              clearNetworkTimer();
              networkTimerRef.current = setTimeout(() => {
                if (!isDisposed && hlsRef.current) {
                  hlsRef.current.startLoad();
                }
              }, delay);
              break;
            }

            case Hls.ErrorTypes.MEDIA_ERROR: {
              if (mediaRecoveryCount.current === 0) {
                mediaRecoveryCount.current += 1;
                hls.recoverMediaError();
              } else if (mediaRecoveryCount.current === 1) {
                mediaRecoveryCount.current += 1;
                hls.swapAudioCodec();
                hls.recoverMediaError();
              } else {
                setPhase('error');
                setErrorMessage(data.details || 'Media playback error');
              }
              break;
            }

            default: {
              if (otherRecoveryCount.current === 0) {
                otherRecoveryCount.current += 1;
                hls.destroy();
                const nextHls = createHlsInstance();
                hlsRef.current = nextHls;
                nextHls.attachMedia(video);
              } else {
                setPhase('error');
                setErrorMessage(data.details || 'Playback error occurred');
              }
              break;
            }
          }
        });

        return hls;
      };

      const hls = createHlsInstance();
      hlsRef.current = hls;
      hls.attachMedia(video);

      return () => {
        isDisposed = true;
        clearNetworkTimer();
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('volumechange', handleVolumeChange);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }

    // Branch 2: Native HLS (Safari/iOS)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;

      const handleLoadedMetadata = () => {
        if (!isDisposed) {
          attemptAutoplay();
        }
      };

      const handleNativeError = () => {
        if (!isDisposed) {
          setPhase('error');
          setErrorMessage(video.error?.message || 'Native video error');
        }
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('error', handleNativeError);

      return () => {
        isDisposed = true;
        clearNetworkTimer();
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('error', handleNativeError);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('volumechange', handleVolumeChange);
        video.removeAttribute('src');
        video.load();
      };
    }

    // Branch 3: Neither supported
    setPhase('error');
    setErrorMessage('HLS is not supported in this browser');

    return () => {
      isDisposed = true;
      clearNetworkTimer();
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [video, src, retryKey, clearNetworkTimer]);

  return { phase, errorMessage, retry, needsUnmute };
}
