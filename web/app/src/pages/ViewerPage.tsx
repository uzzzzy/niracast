import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { rampVolumeDown, restoreVolume } from '../features/viewer/channelTransition';
import { ChannelDrawer } from '../features/viewer/components/ChannelDrawer';
import { HudOverlay } from '../features/viewer/components/HudOverlay';
import { IdleCard } from '../features/viewer/components/IdleCard';
import { ProgramGuideSheet } from '../features/viewer/components/ProgramGuideSheet';
import { ShortcutsModal } from '../features/viewer/components/ShortcutsModal';
import { useHlsPlayer } from '../features/viewer/hooks/useHlsPlayer';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useMotionMode } from '../lib/motion/mode';

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoEl(node);
  }, []);

  // Panels state
  const [isChannelsOpen, setIsChannelsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // HUD and Player interaction state
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Motion mode and channel switch transition state
  const { cyclePreference } = useMotionMode();
  const [isSwitching, setIsSwitching] = useState(false);
  const [bumpChannel, setBumpChannel] = useState<{ number: number; name: string } | null>(null);
  const prevIdRef = useRef<string | undefined>(id);
  const savedVolumeRef = useRef<number>(1);
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

  // Channel switch transition: fade stage out 200ms, ramp volume down 200ms, bump for ~1.2s, fade in
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

  // HUD Auto-hide logic (3s timer)
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
    }, 3000);
  }, [phase, isChannelsOpen, isGuideOpen, isShortcutsOpen]);

  useEffect(() => {
    resetHudTimer();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHudTimer]);

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
    if (!nextMuted && video.volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
    resetHudTimer();
  }, [resetHudTimer]);

  const handleVolumeChange = useCallback(
    (newVol: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = newVol;
      setVolume(newVol);
      if (newVol > 0 && video.muted) {
        video.muted = false;
        setIsMuted(false);
      }
      resetHudTimer();
    },
    [resetHudTimer],
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

  // Keyboard shortcut listener
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
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }
      if (e.shiftKey && e.key !== '?') {
        return;
      }

      resetHudTimer();

      // Esc closes panels
      if (e.key === 'Escape') {
        if (isChannelsOpen || isGuideOpen || isShortcutsOpen) {
          e.preventDefault();
          setIsChannelsOpen(false);
          setIsGuideOpen(false);
          setIsShortcutsOpen(false);
        }
        return;
      }

      // ? opens shortcuts
      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        setIsChannelsOpen(false);
        setIsGuideOpen(false);
        return;
      }

      // M: toggle mute
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
        return;
      }

      // F: fullscreen
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // P: picture-in-picture
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePip();
        return;
      }

      // G: program guide
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setIsGuideOpen((prev) => !prev);
        setIsChannelsOpen(false);
        setIsShortcutsOpen(false);
        return;
      }

      // C: channel drawer
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setIsChannelsOpen((prev) => !prev);
        setIsGuideOpen(false);
        setIsShortcutsOpen(false);
        return;
      }

      // Digits 1-9: jump to channel N
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const digitIndex = Number.parseInt(e.key, 10) - 1;
        if (sortedChannels[digitIndex]) {
          navigateToChannel(sortedChannels[digitIndex].id);
        }
        return;
      }

      // ArrowUp / PageUp: previous channel
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        navigateChannelRelative(-1);
        return;
      }

      // N: cycle motion mode (Auto / Full / Lite)
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        cyclePreference();
        return;
      }

      // ArrowDown / PageDown: next channel
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        navigateChannelRelative(1);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isChannelsOpen,
    isGuideOpen,
    isShortcutsOpen,
    resetHudTimer,
    toggleMute,
    toggleFullscreen,
    togglePip,
    sortedChannels,
    navigateToChannel,
    navigateChannelRelative,
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
      className={`fixed inset-0 overflow-hidden bg-black select-none ${
        isHudVisible ? 'cursor-default' : 'cursor-none'
      }`}
    >
      {/* Accessible Live Region */}
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Video Element (object-contain, full viewport stage with 200ms fade on switch) */}
      <div
        className={`h-full w-full transition-opacity duration-200 ${
          isSwitching ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <video
          ref={handleVideoRef}
          playsInline
          className="h-full w-full object-contain"
          aria-label={channel.name}
        >
          <track kind="captions" />
        </video>
      </div>

      {/* Centered Channel Bump Overlay on Switch (~1.2s transform+opacity, strictly no backdrop-filter) */}
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

      {/* Right-Side Channel Switcher Drawer */}
      <ChannelDrawer
        isOpen={isChannelsOpen}
        onClose={() => setIsChannelsOpen(false)}
        channels={channels}
        currentChannelId={channel.id}
        onSelectChannel={navigateToChannel}
      />

      {/* Bottom Sheet Program Guide */}
      <ProgramGuideSheet
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        items={epg?.items || []}
        channelName={channel.name}
      />

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
}
