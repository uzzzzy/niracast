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
import type { Channel, ChannelStatus, EpgItem } from '../../../lib/api';
import { t } from '../../../lib/i18n';
import { formatCountdown } from '../utils';

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
        className={`relative z-10 flex items-center justify-between p-6 ${isTv ? 'tv-safe-area' : ''}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-[#16161B]/90 px-4 py-2 shadow-lg">
            <span className="font-mono text-sm font-bold text-[#0A84FF]">#{channel.number}</span>
            <span className="h-3 w-px bg-white/20" />
            <h1 className="text-sm font-semibold tracking-wide text-white">{channel.name}</h1>
          </div>

          {isReconnecting && (
            <div
              data-testid="reconnecting-chip"
              className="flex h-8 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 shadow-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {t('reconnecting')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isIdle ? (
            <div
              data-testid="idle-badge"
              className="flex h-8 items-center rounded-full border border-white/15 bg-neutral-800/90 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-300 shadow-md"
            >
              {t('idle')}
            </div>
          ) : (
            <div
              data-testid="live-badge"
              className="flex h-8 items-center gap-1.5 rounded-full border border-[#30D158]/30 bg-emerald-950/90 px-3 text-xs font-semibold uppercase tracking-wider text-[#30D158] shadow-md"
            >
              <span className="h-2 w-2 rounded-full bg-[#30D158] animate-live-pulse" />
              {t('live')}
            </div>
          )}
        </div>
      </header>

      {/* Center Action: Tap to Unmute */}
      {needsUnmute && (
        <div className="relative z-10 flex justify-center py-4 pointer-events-auto">
          <button
            type="button"
            data-focusable
            onClick={onUnmuteTap}
            aria-label={t('tap_to_unmute')}
            className={`flex min-h-[44px] items-center gap-2.5 rounded-full border border-white/20 bg-[#16161B]/95 px-6 py-2.5 text-sm font-medium text-white shadow-2xl transition hover:bg-[#22222A] focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
          >
            <VolumeX className="h-4 w-4 text-[#0A84FF]" />
            <span>{t('tap_to_unmute')}</span>
          </button>
        </div>
      )}

      {/* Bottom HUD */}
      <footer
        data-nav-group="hud"
        className={`relative z-10 p-6 space-y-4 ${isTv ? 'tv-safe-area' : ''}`}
      >
        {/* Info & Progress */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-xs text-[#8E8E93]">
            <div className="flex items-center gap-2 font-medium text-white text-base">
              <span className="text-[#8E8E93] text-xs uppercase tracking-wider">
                {t('now_playing')}:
              </span>
              <span className="truncate max-w-md sm:max-w-xl">{nowPlayingTitle}</span>
            </div>

            {nextItemInfo && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-[#8E8E93] font-mono">
                <span>{t('next')}:</span>
                <span className="text-white font-medium">{nextItemInfo.title}</span>
                <span>
                  {t('in')} {formatCountdown(nextItemInfo.remainingSec)}
                </span>
              </div>
            )}
          </div>

          {/* Thin Progress Bar (transform scaleX only) */}
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full w-full bg-[#0A84FF] transition-transform duration-300 ease-out"
              style={{
                transform: `scaleX(${progressPercent / 100})`,
                transformOrigin: 'left',
              }}
            />
          </div>

          {nextItemInfo && (
            <div className="flex sm:hidden items-center gap-1 text-[11px] text-[#8E8E93] font-mono">
              <span>{t('next')}:</span>
              <span className="text-white truncate max-w-[200px]">{nextItemInfo.title}</span>
              <span>
                {t('in')} {formatCountdown(nextItemInfo.remainingSec)}
              </span>
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between pointer-events-auto">
          {/* Left Controls: Volume & Guide & Channels */}
          <div className="flex items-center gap-2">
            {/* Mute/Volume button */}
            <div className="flex items-center rounded-2xl border border-white/10 bg-[#16161B]/90 px-1 py-0.5 shadow-lg">
              <button
                type="button"
                data-focusable
                onClick={onToggleMute}
                aria-label={isMuted ? t('unmute') : t('mute')}
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                aria-label={t('volume')}
                className="mx-2 h-1.5 w-16 sm:w-24 cursor-pointer accent-[#0A84FF]"
              />
            </div>

            {/* Program Guide Button */}
            <button
              type="button"
              data-focusable
              onClick={onOpenGuide}
              aria-label={t('program_guide')}
              className={`flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-[#16161B]/90 px-3.5 text-xs font-semibold text-neutral-200 shadow-lg hover:text-white hover:bg-[#22222A] focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
            >
              <Calendar className="h-4 w-4 text-[#0A84FF]" />
              <span className="hidden sm:inline">{t('program_guide')}</span>
              {!isTv && (
                <kbd className="hidden sm:inline rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#8E8E93]">
                  G
                </kbd>
              )}
            </button>

            {/* Channels Button */}
            <button
              type="button"
              data-focusable
              onClick={onOpenChannels}
              aria-label={t('channels')}
              className={`flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-[#16161B]/90 px-3.5 text-xs font-semibold text-neutral-200 shadow-lg hover:text-white hover:bg-[#22222A] focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
            >
              <Tv className="h-4 w-4 text-[#0A84FF]" />
              <span className="hidden sm:inline">{t('channels')}</span>
              {!isTv && (
                <kbd className="hidden sm:inline rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#8E8E93]">
                  C
                </kbd>
              )}
            </button>
          </div>

          {/* Right Controls: PiP, Fullscreen, Shortcuts */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-focusable
              onClick={onOpenShortcuts}
              aria-label={isTv ? t('remote_legend_title') : t('shortcuts_help')}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#16161B]/90 text-neutral-300 shadow-lg hover:text-white hover:bg-[#22222A] focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
            >
              <HelpCircle className="h-5 w-5" />
            </button>

            <button
              type="button"
              data-focusable
              onClick={onTogglePip}
              aria-label={t('pip')}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#16161B]/90 text-neutral-300 shadow-lg hover:text-white hover:bg-[#22222A] focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>

            <button
              type="button"
              data-focusable
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? t('exit_fullscreen') : t('fullscreen')}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#16161B]/90 text-neutral-300 shadow-lg hover:text-white hover:bg-[#22222A] focus:outline-none ${isTv ? 'tv-pill-button' : ''}`}
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
