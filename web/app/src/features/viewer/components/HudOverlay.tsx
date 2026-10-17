import {
  Calendar,
  HelpCircle,
  Maximize,
  Minimize,
  PictureInPicture2,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type React from 'react';
import { Button, StatusPill } from '../../../components/ui';
import type { Channel, ChannelStatus, EpgItem } from '../../../lib/api';
import { t } from '../../../lib/i18n';
import { formatTimecode } from '../utils';

interface HudOverlayProps {
  isVisible: boolean;
  channel: Channel;
  status?: ChannelStatus;
  epgItems: EpgItem[];
  isReconnecting: boolean;
  progressPercent: number;
  nextItemInfo: { title: string; remainingSec: number } | null;
  isMuted: boolean;
  volume: number;
  isFullscreen: boolean;
  needsUnmute: boolean;
  isTv?: boolean;
  isMobile?: boolean;
  isFullscreenSupported?: boolean;
  isPipSupported?: boolean;
  onToggleMute: () => void;
  onVolumeChange: (val: number) => void;
  onToggleFullscreen: () => void;
  onTogglePip: () => void;
  onOpenGuide: () => void;
  onOpenChannels: () => void;
  onOpenShortcuts: () => void;
  onUnmuteTap: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  isVisible,
  channel,
  status,
  isReconnecting,
  progressPercent,
  nextItemInfo,
  isMuted,
  volume,
  isFullscreen,
  needsUnmute,
  isTv = false,
  isMobile = false,
  isFullscreenSupported = true,
  isPipSupported = true,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onTogglePip,
  onOpenGuide,
  onOpenChannels,
  onOpenShortcuts,
  onUnmuteTap,
}) => {
  const isIdle = status?.state === 'idle';
  const nowPlayingTitle = status?.item?.filename || (isIdle ? t('idle_title') : channel.name);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between transition-hud ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Top Scrim */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none" />

      {/* Bottom Scrim */}
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />

      {/* Top Header */}
      <header
        className={`relative z-10 flex items-center justify-between p-4 sm:p-6 pt-[max(env(safe-area-inset-top),1rem)] pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] ${
          isTv ? 'tv-safe-area' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 items-center gap-2 rounded-control border border-hairline glass-hud px-3.5 sm:px-4 py-2 shadow-1">
            <span className="font-mono text-sm font-bold text-accent timecode">
              #{channel.number}
            </span>
            <span className="h-3 w-px bg-hairline" />
            <span className="text-xs sm:text-sm font-semibold tracking-wide text-fg truncate max-w-[140px] sm:max-w-xs">
              {channel.name}
            </span>
          </div>

          {isReconnecting && (
            <div
              data-testid="reconnecting-chip"
              className="flex h-8 items-center gap-1.5 rounded-full border border-idle/30 bg-idle/15 px-3 py-1 text-xs font-medium text-idle shadow-1"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-idle animate-pulse" />
              <span className="hidden sm:inline">{t('reconnecting')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <StatusPill
            status={isIdle ? 'idle' : 'onair'}
            data-testid={isIdle ? 'idle-badge' : 'live-badge'}
          >
            {isIdle ? t('idle') : t('live')}
          </StatusPill>
        </div>
      </header>

      {/* Center Action: Tap to Unmute */}
      {needsUnmute && (
        <div className="relative z-10 flex justify-center py-4 pointer-events-auto">
          <Button
            variant="glass"
            size="lg"
            data-focusable
            onClick={onUnmuteTap}
            aria-label={t('tap_to_unmute')}
            className={`gap-2.5 rounded-full ${isTv ? 'tv-pill-button' : ''}`}
          >
            <VolumeX className="h-4 w-4 text-accent" />
            <span>{t('tap_to_unmute')}</span>
          </Button>
        </div>
      )}

      {/* Bottom HUD Bar */}
      <footer
        data-nav-group="hud"
        className={`absolute bottom-6 left-6 right-6 mobile:bottom-4 mobile:left-4 mobile:right-4 tv:bottom-10 tv:left-12 tv:right-12 glass-hud rounded-sheet p-4 sm:p-5 shadow-2 pointer-events-auto space-y-3 sm:space-y-4 ${
          isTv ? 'tv-safe-area' : ''
        }`}
      >
        {/* Title and Now/Next */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-base sm:text-lg font-semibold text-fg tracking-wide truncate">
              {channel.name}
            </h1>
            {nextItemInfo && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-fg-muted font-mono timecode shrink-0">
                <span>{t('next')}:</span>
                <span className="text-fg font-medium">{nextItemInfo.title}</span>
                <span>
                  {t('in')} {formatTimecode(nextItemInfo.remainingSec)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-fg-muted">
            <div className="flex items-center gap-2 min-w-0">
              <span className="label-caps shrink-0">{t('now_playing')}:</span>
              <span className="text-fg font-medium truncate max-w-[200px] sm:max-w-md md:max-w-xl">
                {nowPlayingTitle}
              </span>
            </div>

            {nextItemInfo && (
              <div className="flex sm:hidden items-center gap-1 text-[11px] text-fg-muted font-mono timecode">
                <span>{t('next')}:</span>
                <span className="text-fg truncate max-w-[140px]">{nextItemInfo.title}</span>
                <span>
                  {t('in')} {formatTimecode(nextItemInfo.remainingSec)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Timecode progress row (elapsed / 2px track with scaleX / duration) */}
        <div className="flex items-center gap-3 text-xs">
          {status?.item && (
            <span className="font-mono text-xs text-fg-subtle timecode shrink-0">
              {formatTimecode(status.item.seek_sec)}
            </span>
          )}
          <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full w-full bg-accent transition-transform duration-300 ease-out"
              style={{
                transform: `scaleX(${progressPercent / 100})`,
                transformOrigin: 'left',
              }}
            />
          </div>
          {status?.item && (
            <span className="font-mono text-xs text-fg-subtle timecode shrink-0">
              {formatTimecode(status.item.duration_sec)}
            </span>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Controls: Volume & Guide & Channels */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-control border border-hairline glass px-1 py-0.5">
              <Button
                variant="ghost"
                size="icon"
                data-focusable
                onClick={onToggleMute}
                aria-label={isMuted ? t('unmute') : t('mute')}
                className={`text-fg-muted hover:text-fg ${isTv ? 'tv-pill-button' : ''}`}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                aria-label={t('volume')}
                className="mx-2 h-1.5 w-16 sm:w-24 cursor-pointer accent-accent hidden sm:block"
              />
            </div>

            {/* Program Guide Button */}
            <Button
              variant="glass"
              size="md"
              data-focusable
              onClick={onOpenGuide}
              aria-label={t('program_guide')}
              className={`gap-2 ${isTv ? 'tv-pill-button' : ''}`}
            >
              <Calendar className="h-4 w-4 text-accent" />
              <span className="hidden md:inline">{t('program_guide')}</span>
              {!isTv && !isMobile && (
                <kbd className="hidden lg:inline rounded-control bg-surface-3 border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-fg-muted timecode">
                  G
                </kbd>
              )}
            </Button>

            {/* Channels Button */}
            <Button
              variant="glass"
              size="md"
              data-focusable
              onClick={onOpenChannels}
              aria-label={t('channels')}
              className={`gap-2 ${isTv ? 'tv-pill-button' : ''}`}
            >
              <Tv className="h-4 w-4 text-accent" />
              <span className="hidden md:inline">{t('channels')}</span>
              {!isTv && !isMobile && (
                <kbd className="hidden lg:inline rounded-control bg-surface-3 border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-fg-muted timecode">
                  C
                </kbd>
              )}
            </Button>
          </div>

          {/* Right Controls: Shortcuts, PiP, Fullscreen */}
          <div className="flex items-center gap-2">
            {!isMobile && (
              <Button
                variant="glass"
                size="icon"
                data-focusable
                onClick={onOpenShortcuts}
                aria-label={isTv ? t('remote_legend_title') : t('shortcuts_help')}
                className={isTv ? 'tv-pill-button' : ''}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            )}

            {isPipSupported && (
              <Button
                variant="glass"
                size="icon"
                data-focusable
                onClick={onTogglePip}
                aria-label={t('pip')}
                className={isTv ? 'tv-pill-button' : ''}
              >
                <PictureInPicture2 className="h-4 w-4" />
              </Button>
            )}

            {isFullscreenSupported && (
              <Button
                variant="glass"
                size="icon"
                data-focusable
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? t('exit_fullscreen') : t('fullscreen')}
                className={isTv ? 'tv-pill-button' : ''}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
