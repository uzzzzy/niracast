import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { rampVolumeDown, restoreVolume } from '../features/viewer/channelTransition';
import { ChannelDrawer } from '../features/viewer/components/ChannelDrawer';
import { ChannelRailTv } from '../features/viewer/components/ChannelRailTv';
import { DigitEntryOverlay } from '../features/viewer/components/DigitEntryOverlay';
import { HudOverlay } from '../features/viewer/components/HudOverlay';
import { IdleCard } from '../features/viewer/components/IdleCard';
import { ProgramGuideSheet } from '../features/viewer/components/ProgramGuideSheet';
import { RemoteLegendModal } from '../features/viewer/components/RemoteLegendModal';
import { ShortcutsModal } from '../features/viewer/components/ShortcutsModal';
import { VolumeToast } from '../features/viewer/components/VolumeToast';
import { useHlsPlayer } from '../features/viewer/hooks/useHlsPlayer';
import {
  applyStoredAudio,
  getStoredMuted,
  getStoredVolume,
  setStoredMuted,
  setStoredVolume,
} from '../features/viewer/volumePersistence';
import { api } from '../lib/api';
import { useUiProfile } from '../lib/device';
import { useSwipeGesture } from '../lib/gestures';
import { t } from '../lib/i18n';
import { useMotionMode } from '../lib/motion/mode';
import { normalizeRemoteKey, registerTizenKeys } from '../lib/remoteKeys';
import { useSpatialNav } from '../lib/spatialNav';

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const uiProfile = useUiProfile();
  const isTv = uiProfile === 'tv';
  const isMobile = uiProfile === 'mobile';

  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFullscreenSupported = useMemo(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(
      document.fullscreenEnabled ||
        // @ts-expect-error vendor prefix
        document.webkitFullscreenEnabled,
    );
  }, []);

  const isPipSupported = useMemo(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(
      document.pictureInPictureEnabled ||
        (videoEl &&
          typeof (videoEl as unknown as { webkitSetPresentationMode?: unknown })
            .webkitSetPresentationMode === 'function'),
    );
  }, [videoEl]);

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoEl(node);
    if (node) {
      applyStoredAudio(node);
    }
  }, []);

  // Register Tizen TV keys on mount
  useEffect(() => {
    registerTizenKeys();
  }, []);

  // Panels state
  const [isChannelsOpen, setIsChannelsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // HUD and Player interaction state
  const [isHudVisible, setIsHudVisible] = useState(() => !isTv);
  const [isMuted, setIsMuted] = useState(getStoredMuted);
  const [volume, setVolume] = useState(getStoredVolume);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Transient volume toast state
  const [volumeToastVisible, setVolumeToastVisible] = useState(false);
  const [volumeToastMessage, setVolumeToastMessage] = useState<string | undefined>();
  const volumeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showVolumeToast = useCallback((msg?: string) => {
    setVolumeToastMessage(msg);
    setVolumeToastVisible(true);
    if (volumeToastTimerRef.current) {
      clearTimeout(volumeToastTimerRef.current);
    }
    volumeToastTimerRef.current = setTimeout(() => {
      setVolumeToastVisible(false);
      setVolumeToastMessage(undefined);
    }, 2000);
  }, []);

  // Digit Entry state
  const digitBufferRef = useRef('');
  const [digitBuffer, setDigitBuffer] = useState('');
  const [digitError, setDigitError] = useState(false);
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digitErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Motion mode and channel switch transition state
  const { cyclePreference } = useMotionMode();
  const [isSwitching, setIsSwitching] = useState(false);
  const [bumpChannel, setBumpChannel] = useState<{
    number: number;
    name: string;
  } | null>(null);
  const prevIdRef = useRef<string | undefined>(id);
  const savedVolumeRef = useRef<number>(getStoredVolume());
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Fetch channel list (every 30s)
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: api.getChannels,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => a.number - b.number);
  }, [channels]);

  // 2. Fetch current channel details
  const {
    data: channel,
    isLoading: channelLoading,
    error: channelError,
  } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => api.getChannel(id ?? ''),
    enabled: Boolean(id),
  });

  // 3. Fetch channel status (every 5s)
  const { data: status, isError: statusError } = useQuery({
    queryKey: ['channel-status', id],
    queryFn: () => api.getChannelStatus(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // 4. Fetch EPG (every 15s)
  const { data: epg, isError: epgError } = useQuery({
    queryKey: ['channel-epg', id],
    queryFn: () => api.getEpg(id ?? '', 10),
    enabled: Boolean(id),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const isReconnecting = statusError || epgError;

  // Stream source
  const streamSrc = id ? `/channels/${id}/live.m3u8` : null;
  const { phase, errorMessage, retry, needsUnmute } = useHlsPlayer(videoEl, streamSrc);

  // Announce channel changes in live region
  useEffect(() => {
    if (channel) {
      setLiveAnnouncement(`Channel ${channel.number}, ${channel.name}`);
    }
  }, [channel]);

  // Channel switch transition
  useEffect(() => {
    if (prevIdRef.current && prevIdRef.current !== id) {
      const target = channels.find((c) => String(c.id) === id);
      if (target) {
        setBumpChannel({ number: target.number, name: target.name });
      }
      setIsSwitching(true);

      const video = videoRef.current;
      if (video) {
        savedVolumeRef.current = video.volume;
        rampVolumeDown(video, 200);
      }

      if (switchTimerRef.current) {
        clearTimeout(switchTimerRef.current);
      }

      switchTimerRef.current = setTimeout(() => {
        setIsSwitching(false);
        setBumpChannel(null);
        if (videoRef.current) {
          restoreVolume(videoRef.current, savedVolumeRef.current, 200);
          applyStoredAudio(videoRef.current);
        }
      }, 1200);
    }
    prevIdRef.current = id;

    return () => {
      if (switchTimerRef.current) {
        clearTimeout(switchTimerRef.current);
      }
    };
  }, [id, channels]);

  // Progress computation & local 1s tick
  const [localSeekSec, setLocalSeekSec] = useState(0);

  useEffect(() => {
    if (!status?.item) {
      setLocalSeekSec(0);
      return;
    }

    const baseSeek = status.item.seek_sec;
    const syncTimestamp = Date.now();
    setLocalSeekSec(baseSeek);

    const interval = setInterval(() => {
      const elapsed = (Date.now() - syncTimestamp) / 1000;
      setLocalSeekSec(baseSeek + elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [status?.item]);

  const durationSec = status?.item?.duration_sec || 0;
  const progressPercent =
    durationSec > 0 ? Math.min(100, Math.max(0, (localSeekSec / durationSec) * 100)) : 0;

  // Next item from EPG
  const nextItemInfo = useMemo(() => {
    if (!epg?.items || epg.items.length < 2) return null;
    const next = epg.items.find((item) => !item.is_current) || epg.items[1];
    if (!next) return null;
    const startMs = new Date(next.start_at).getTime();
    const remainingSec = Math.max(0, (startMs - Date.now()) / 1000);
    return {
      title: next.title,
      remainingSec,
    };
  }, [epg]);

  // HUD Auto-hide logic (8s for TV, 3s for desktop)
  const hudTimeout = isTv ? 8000 : 3000;
  const resetHudTimer = useCallback(() => {
    setIsHudVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    // Always visible while paused-by-error or while a panel is open
    if (phase === 'error' || isChannelsOpen || isGuideOpen || isShortcutsOpen) {
      return;
    }

    hideTimerRef.current = setTimeout(() => {
      setIsHudVisible(false);
    }, hudTimeout);
  }, [phase, isChannelsOpen, isGuideOpen, isShortcutsOpen, hudTimeout]);

  useEffect(() => {
    if (isHudVisible) {
      resetHudTimer();
    }
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHudTimer, isHudVisible]);

  // Sync fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Controls actions
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    setStoredMuted(nextMuted);
    if (!nextMuted && video.volume === 0) {
      video.volume = 1;
      setVolume(1);
      setStoredVolume(1);
    }
    resetHudTimer();
  }, [resetHudTimer]);

  const handleVolumeChange = useCallback(
    (newVol: number) => {
      const clamped = Math.min(1, Math.max(0, newVol));
      const video = videoRef.current;
      if (video) {
        video.volume = clamped;
      }
      setVolume(clamped);
      setStoredVolume(clamped);
      if (clamped > 0 && isMuted) {
        if (video) video.muted = false;
        setIsMuted(false);
        setStoredMuted(false);
      }
      resetHudTimer();
    },
    [isMuted, resetHudTimer],
  );

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    resetHudTimer();
  }, [resetHudTimer]);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.().catch(() => {});
    } else if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
      video.requestPictureInPicture().catch(() => {});
    }
    resetHudTimer();
  }, [resetHudTimer]);

  const handleUnmuteTap = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      setIsMuted(false);
      setStoredMuted(false);
    }
    resetHudTimer();
  }, [resetHudTimer]);

  // Channel switching
  const navigateToChannel = useCallback(
    (targetId: number) => {
      navigate(`/watch/${targetId}`);
    },
    [navigate],
  );

  const navigateChannelRelative = useCallback(
    (delta: number) => {
      if (sortedChannels.length === 0 || !channel) return;
      const currentIndex = sortedChannels.findIndex((c) => c.id === channel.id);
      if (currentIndex === -1) return;
      const nextIndex = (currentIndex + delta + sortedChannels.length) % sortedChannels.length;
      navigateToChannel(sortedChannels[nextIndex].id);
    },
    [sortedChannels, channel, navigateToChannel],
  );

  // Commit Digit Input
  const commitDigit = useCallback(
    (digits: string) => {
      const num = Number.parseInt(digits, 10);
      if (Number.isNaN(num)) return;
      const target = channels.find((c) => c.number === num);
      if (target) {
        navigateToChannel(target.id);
        digitBufferRef.current = '';
        setDigitBuffer('');
        setDigitError(false);
      } else {
        setDigitError(true);
        if (digitErrorTimerRef.current) {
          clearTimeout(digitErrorTimerRef.current);
        }
        digitErrorTimerRef.current = setTimeout(() => {
          setDigitError(false);
          digitBufferRef.current = '';
          setDigitBuffer('');
        }, 1200);
      }
    },
    [channels, navigateToChannel],
  );

  const handleDigitInput = useCallback(
    (digit: number) => {
      const nextBuffer = `${digitBufferRef.current}${digit}`;
      digitBufferRef.current = nextBuffer;
      setDigitBuffer(nextBuffer);
      setDigitError(false);

      if (digitTimerRef.current) {
        clearTimeout(digitTimerRef.current);
      }
      digitTimerRef.current = setTimeout(() => {
        commitDigit(nextBuffer);
      }, 1500);
    },
    [commitDigit],
  );

  // Spatial Navigation Hook (active when on TV and either HUD or a panel is open)
  const anyPanelOpen = isChannelsOpen || isGuideOpen || isShortcutsOpen;
  const spatialNavEnabled = isTv && (isHudVisible || anyPanelOpen);
  const { focusGroup } = useSpatialNav(containerRef, spatialNavEnabled);

  // Touch and swipe gestures (active on mobile and non-TV pointer devices)
  useSwipeGesture(containerRef, {
    enabled: !isTv,
    threshold: 50,
    minVelocity: 0.2,
    onSwipeUp: () => {
      if (anyPanelOpen) return;
      navigateChannelRelative(1);
    },
    onSwipeDown: () => {
      if (anyPanelOpen) return;
      navigateChannelRelative(-1);
    },
    onTap: () => {
      setIsHudVisible((prev) => !prev);
      resetHudTimer();
    },
    onDoubleTap: ({ clientX }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const left = rect?.left ?? 0;
      const isLeftHalf = clientX < left + width / 2;
      if (isLeftHalf) {
        toggleMute();
        showVolumeToast(!isMuted ? t('muted_chip') : t('unmuted_chip'));
      } else if (isFullscreenSupported) {
        toggleFullscreen();
      }
    },
  });

  // Remote and Keyboard Control Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        // If focusing a slider or range input on remote, allow remote keys
        if (target.tagName !== 'INPUT' || (target as HTMLInputElement).type !== 'range') {
          return;
        }
      }

      const remoteEvent = normalizeRemoteKey(e);

      // Modifier keys ignored on remote unless desktop shortcut
      if ((e.ctrlKey || e.altKey || e.metaKey) && e.key !== '?') {
        return;
      }

      // Handle Digit Entry
      if (remoteEvent?.action === 'digit' && typeof remoteEvent.digit === 'number') {
        e.preventDefault();
        handleDigitInput(remoteEvent.digit);
        return;
      }

      // If user is currently typing digits and presses OK/Enter: commit immediately
      if (
        digitBufferRef.current.length > 0 &&
        (remoteEvent?.action === 'ok' || e.key === 'Enter')
      ) {
        e.preventDefault();
        if (digitTimerRef.current) {
          clearTimeout(digitTimerRef.current);
          digitTimerRef.current = null;
        }
        commitDigit(digitBufferRef.current);
        return;
      }

      // TV Mode Remote D-Pad Navigation
      if (isTv) {
        // 1. Back button closes topmost layer
        if (remoteEvent?.action === 'back') {
          e.preventDefault();
          if (digitBufferRef.current.length > 0) {
            digitBufferRef.current = '';
            setDigitBuffer('');
            setDigitError(false);
            return;
          }
          if (isShortcutsOpen) {
            setIsShortcutsOpen(false);
            return;
          }
          if (isGuideOpen) {
            setIsGuideOpen(false);
            return;
          }
          if (isChannelsOpen) {
            setIsChannelsOpen(false);
            return;
          }
          if (isHudVisible) {
            setIsHudVisible(false);
            if (hideTimerRef.current) {
              clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
            return;
          }
          // When nothing is open: do nothing, never leave the page unexpectedly
          return;
        }

        // 2. Guide opens program guide
        if (remoteEvent?.action === 'guide') {
          e.preventDefault();
          setIsGuideOpen(true);
          setIsChannelsOpen(false);
          setIsShortcutsOpen(false);
          resetHudTimer();
          setTimeout(() => focusGroup('guide'), 50);
          return;
        }

        // 3. Info toggles info banner
        if (remoteEvent?.action === 'info') {
          e.preventDefault();
          setIsHudVisible((prev) => !prev);
          resetHudTimer();
          return;
        }

        // 4. Play/Pause toggles mute (live TV cannot pause)
        if (
          remoteEvent?.action === 'play' ||
          remoteEvent?.action === 'pause' ||
          remoteEvent?.action === 'playPause'
        ) {
          e.preventDefault();
          toggleMute();
          showVolumeToast(!isMuted ? t('muted_chip') : t('unmuted_chip'));
          return;
        }

        // 5. State A: When NO panel and NO HUD-menu is open
        if (!anyPanelOpen && !isHudVisible) {
          if (remoteEvent?.action === 'up' || remoteEvent?.action === 'channelUp') {
            e.preventDefault();
            navigateChannelRelative(-1);
            return;
          }

          if (remoteEvent?.action === 'down' || remoteEvent?.action === 'channelDown') {
            e.preventDefault();
            navigateChannelRelative(1);
            return;
          }

          if (remoteEvent?.action === 'left') {
            e.preventDefault();
            const nextVol = Math.max(0, Number((volume - 0.05).toFixed(2)));
            handleVolumeChange(nextVol);
            showVolumeToast();
            return;
          }

          if (remoteEvent?.action === 'right') {
            e.preventDefault();
            const nextVol = Math.min(1, Number((volume + 0.05).toFixed(2)));
            handleVolumeChange(nextVol);
            showVolumeToast();
            return;
          }

          if (remoteEvent?.action === 'ok') {
            e.preventDefault();
            setIsHudVisible(true);
            resetHudTimer();
            setTimeout(() => {
              focusGroup('hud');
            }, 50);
            return;
          }
        } else {
          // State B: When HUD menu or a panel IS open
          resetHudTimer();
          // Note: Arrow keys are automatically handled by useSpatialNav!
          // Note: OK natively activates the focused element.
        }
      } else {
        // Desktop Mode Keyboard Handling
        resetHudTimer();

        if (e.key === 'Escape') {
          if (isChannelsOpen || isGuideOpen || isShortcutsOpen) {
            e.preventDefault();
            setIsChannelsOpen(false);
            setIsGuideOpen(false);
            setIsShortcutsOpen(false);
          }
          return;
        }

        if (e.key === '?') {
          e.preventDefault();
          setIsShortcutsOpen((prev) => !prev);
          setIsChannelsOpen(false);
          setIsGuideOpen(false);
          return;
        }

        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMute();
          return;
        }

        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
          return;
        }

        if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          togglePip();
          return;
        }

        if (e.key === 'g' || e.key === 'G') {
          e.preventDefault();
          setIsGuideOpen((prev) => !prev);
          setIsChannelsOpen(false);
          setIsShortcutsOpen(false);
          return;
        }

        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          setIsChannelsOpen((prev) => !prev);
          setIsGuideOpen(false);
          setIsShortcutsOpen(false);
          return;
        }

        if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          navigateChannelRelative(-1);
          return;
        }

        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
          e.preventDefault();
          navigateChannelRelative(1);
          return;
        }

        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          cyclePreference();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isTv,
    anyPanelOpen,
    isHudVisible,
    isChannelsOpen,
    isGuideOpen,
    isShortcutsOpen,
    volume,
    isMuted,
    resetHudTimer,
    navigateChannelRelative,
    handleVolumeChange,
    showVolumeToast,
    focusGroup,
    toggleMute,
    handleDigitInput,
    commitDigit,
    toggleFullscreen,
    togglePip,
    cyclePreference,
  ]);

  if (channelLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0E] text-[#8E8E93]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-[#0A84FF]" />
          <span className="text-sm">{t('loading_channel')}</span>
        </div>
      </div>
    );
  }

  if (channelError || !channel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0B0E] p-6 text-center text-[#F5F5F7]">
        <h1 className="text-xl font-semibold">{t('channel_not_found')}</h1>
        <p className="mt-2 text-sm text-[#8E8E93]">{t('channel_not_found_desc')}</p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[#0A84FF] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
        >
          {t('back_to_channels')}
        </Link>
      </div>
    );
  }

  const isIdle = status?.state === 'idle' || Boolean(epg?.idle);

  return (
    <div
      ref={containerRef}
      onPointerMove={resetHudTimer}
      onPointerDown={resetHudTimer}
      className={`fixed inset-0 h-[100dvh] w-full overflow-hidden bg-black select-none ${
        isTv ? 'cursor-none' : isHudVisible ? 'cursor-default' : 'cursor-none'
      }`}
    >
      {/* Accessible Live Region */}
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Video Element */}
      <div
        className={`h-full w-full transition-opacity duration-200 ${
          isSwitching ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <video
          ref={handleVideoRef}
          playsInline
          webkit-playsinline="true"
          className="h-full w-full object-contain"
          aria-label={channel.name}
        >
          <track kind="captions" />
        </video>
      </div>

      {/* Centered Channel Bump Overlay on Switch */}
      {isSwitching && (bumpChannel || channel) && (
        <div
          data-testid="channel-bump"
          className="pointer-events-none fixed top-1/2 left-1/2 z-30 animate-channel-bump flex items-center gap-3 rounded-2xl border border-white/20 bg-[#16161B]/95 px-6 py-4 shadow-2xl"
        >
          <span className="font-mono text-2xl font-bold text-[#0A84FF]">
            #{(bumpChannel || channel).number}
          </span>
          <span className="h-6 w-px bg-white/20" />
          <span className="text-xl font-semibold tracking-wide text-white">
            {(bumpChannel || channel).name}
          </span>
        </div>
      )}

      {/* Loading Overlay */}
      {phase === 'loading' && (
        <div
          data-testid="player-loading"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 transition-opacity"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#16161B]/90 px-5 py-3 text-sm text-white shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-[#0A84FF]" />
            <span>{t('loading_broadcast')}</span>
          </div>
        </div>
      )}

      {/* Buffering Overlay */}
      {phase === 'buffering' && (
        <div
          data-testid="player-buffering"
          className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#16161B]/80 px-4 py-1.5 text-xs text-white shadow-lg"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0A84FF]" />
          <span>{t('buffering')}</span>
        </div>
      )}

      {/* Error Overlay with Retry */}
      {phase === 'error' && (
        <div
          data-testid="player-error"
          className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/80"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16161B]/95 p-6 text-center text-[#F5F5F7] shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-base font-semibold">{t('playback_error')}</h2>
            <p className="mt-1 text-xs text-[#8E8E93]">{errorMessage || t('playback_error')}</p>
            <button
              type="button"
              data-focusable
              onClick={retry}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t('retry')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Idle State Lower-Third Card */}
      {isIdle && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <IdleCard channelName={channel.name} />
        </div>
      )}

      {/* HUD Overlay */}
      <HudOverlay
        isVisible={isHudVisible}
        channel={channel}
        status={status}
        epgItems={epg?.items || []}
        isReconnecting={isReconnecting}
        progressPercent={progressPercent}
        nextItemInfo={nextItemInfo}
        isMuted={isMuted}
        volume={volume}
        isFullscreen={isFullscreen}
        needsUnmute={needsUnmute}
        isTv={isTv}
        isMobile={isMobile}
        isFullscreenSupported={isFullscreenSupported}
        isPipSupported={isPipSupported}
        onToggleMute={toggleMute}
        onVolumeChange={handleVolumeChange}
        onToggleFullscreen={toggleFullscreen}
        onTogglePip={togglePip}
        onOpenGuide={() => {
          setIsGuideOpen(true);
          setIsChannelsOpen(false);
          setIsShortcutsOpen(false);
        }}
        onOpenChannels={() => {
          setIsChannelsOpen(true);
          setIsGuideOpen(false);
          setIsShortcutsOpen(false);
        }}
        onOpenShortcuts={() => {
          setIsShortcutsOpen(true);
          setIsChannelsOpen(false);
          setIsGuideOpen(false);
        }}
        onUnmuteTap={handleUnmuteTap}
      />

      {/* Channel Switcher: Left Rail for TV, Right Drawer / Bottom Sheet for Mobile & Desktop */}
      {isTv ? (
        <ChannelRailTv
          isOpen={isChannelsOpen}
          onClose={() => setIsChannelsOpen(false)}
          channels={channels}
          currentChannelId={channel.id}
          onSelectChannel={navigateToChannel}
        />
      ) : (
        <ChannelDrawer
          isOpen={isChannelsOpen}
          onClose={() => setIsChannelsOpen(false)}
          channels={channels}
          currentChannelId={channel.id}
          onSelectChannel={navigateToChannel}
          isMobile={isMobile}
        />
      )}

      {/* Bottom Sheet Program Guide */}
      <ProgramGuideSheet
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        items={epg?.items || []}
        channelName={channel.name}
      />

      {/* Shortcuts Modal (Desktop) or Remote Legend Modal (TV) */}
      {isTv ? (
        <RemoteLegendModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      ) : (
        <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      )}

      {/* Transient Volume Toast */}
      <VolumeToast
        visible={volumeToastVisible}
        volume={volume}
        isMuted={isMuted}
        message={volumeToastMessage}
      />

      {/* Digit Entry Overlay */}
      <DigitEntryOverlay digits={digitBuffer} hasError={digitError} />
    </div>
  );
}
