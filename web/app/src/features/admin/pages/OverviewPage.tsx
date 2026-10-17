import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Film,
  Loader2,
  Radio,
  SkipForward,
  Tv,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, api, type Channel, type ChannelStatus } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { useAdminEvents } from '../hooks/useAdminEvents';
import { formatDuration, parseUptime } from '../utils/playlist';

function ChannelMonitorCard({
  channel,
  status,
  onSkip,
}: {
  channel: Channel;
  status?: ChannelStatus;
  onSkip: (channelId: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  // Local progress ticker for playing channel item
  const item = status?.item;
  const isPlaying = status?.state === 'playing' && !!item;

  const [currentSeek, setCurrentSeek] = useState<number>(() => item?.seek_sec ?? 0);
  const [sampleTime, setSampleTime] = useState<number>(Date.now());

  useEffect(() => {
    setCurrentSeek(item?.seek_sec ?? 0);
    setSampleTime(Date.now());
  }, [item?.seek_sec]);

  useEffect(() => {
    if (!isPlaying || !item) return;

    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - sampleTime) / 1000;
      const nextSeek = Math.min(item.duration_sec, (item.seek_sec ?? 0) + elapsedSec);
      setCurrentSeek(nextSeek);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, item, sampleTime]);

  const duration = item?.duration_sec ?? 0;
  const remainingSec = Math.max(0, duration - currentSeek);
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentSeek / duration) * 100)) : 0;

  const handleCopyHls = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/channels/${channel.id}/live.m3u8`;
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      toast.success(t('copied_to_clipboard'));
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleSkip = async () => {
    if (!isPlaying || isSkipping) return;
    setIsSkipping(true);
    try {
      await onSkip(channel.id);
      toast.success(t('skip_confirm'));
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(t('skip_error_not_playing'));
      } else {
        toast.error(t('skip_error_not_playing'));
      }
    } finally {
      setIsSkipping(false);
    }
  };

  const state = status?.state || 'stopped';

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-lg transition-all hover:border-white/20">
      <div>
        {/* Header: Number, Name, State Badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 font-mono text-xs font-bold text-neutral-300 border border-white/10">
              #{channel.number}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[#F5F5F7] tracking-tight">
                {channel.name}
              </h3>
            </div>
          </div>

          <div>
            {state === 'playing' ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-live-pulse" />
                {t('badge_playing')}
              </span>
            ) : state === 'idle' ? (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {t('badge_idle')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-[11px] font-semibold text-neutral-400">
                <span className="h-2 w-2 rounded-full bg-neutral-500" />
                {t('badge_stopped')}
              </span>
            )}
          </div>
        </div>

        {/* Now Playing info & Progress bar */}
        <div className="mb-4 rounded-xl bg-[#0B0B0E]/60 border border-white/5 p-3.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            {t('now_playing')}
          </div>
          <div className="truncate text-sm font-medium text-[#F5F5F7] mb-2.5">
            {isPlaying ? item?.filename : state === 'idle' ? t('idle_title') : '-'}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isPlaying ? 'bg-[#0A84FF]' : 'bg-neutral-600'
              }`}
              style={{ width: `${isPlaying ? progressPct : 0}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-neutral-400">
            <span>{isPlaying ? formatDuration(currentSeek) : '00:00'}</span>
            <span>
              {isPlaying
                ? `${formatDuration(remainingSec)} ${t('remaining')}`
                : state === 'idle'
                  ? t('standby')
                  : '00:00'}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2">
          {/* Skip button */}
          <button
            type="button"
            onClick={handleSkip}
            disabled={!isPlaying || isSkipping}
            aria-label={t('skip_button')}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSkipping ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#0A84FF]" />
            ) : (
              <SkipForward className="h-4 w-4 text-[#0A84FF]" />
            )}
            <span>{t('skip_button')}</span>
          </button>

          {/* Copy HLS link */}
          <button
            type="button"
            onClick={handleCopyHls}
            aria-label={t('copy_hls_url')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          >
            {copySuccess ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Open viewer link */}
        <a
          href={`/watch/${channel.id}`}
          target="_blank"
          rel="noreferrer"
          aria-label={t('open_viewer')}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">{t('open_viewer')}</span>
        </a>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const { statuses, refreshChannel } = useAdminEvents();

  const { data: system, isLoading: isSystemLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
  });

  const {
    data: channels,
    isLoading: isChannelsLoading,
    error: channelsError,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: api.getChannels,
  });

  const handleSkipChannel = async (channelId: number) => {
    await api.skipChannel(channelId);
    await refreshChannel(channelId);
  };

  const copyUrl = async (path: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}${path}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success(t('copied_to_clipboard'));
    } catch {
      toast.error('Failed to copy');
    }
  };

  const uptime = parseUptime(system?.uptime_sec ?? 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">{t('overview_title')}</h2>
        <p className="mt-1 text-xs text-neutral-400">{t('overview_subtitle')}</p>
      </div>

      {/* Top stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Media count */}
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('stat_media_count')}
            </span>
            <Film className="h-4 w-4 text-[#0A84FF]" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-[#F5F5F7]">
            {isSystemLoading ? '...' : (system?.media_count ?? 0)}
          </div>
        </div>

        {/* Total channels */}
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('stat_total_channels')}
            </span>
            <Tv className="h-4 w-4 text-[#0A84FF]" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-[#F5F5F7]">
            {isSystemLoading ? '...' : (system?.channel_count ?? 0)}
          </div>
        </div>

        {/* Running channels */}
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t('stat_running_channels')}
            </span>
            <Radio className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-400">
            {isSystemLoading ? '...' : (system?.running_channels ?? 0)}
          </div>
        </div>

        {/* System uptime */}
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">{t('stat_uptime')}</span>
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold tracking-tight text-[#F5F5F7] truncate">
            {isSystemLoading
              ? '...'
              : uptime.days > 0
                ? `${uptime.days}d ${uptime.hours}h ${uptime.mins}m`
                : `${uptime.hours}h ${uptime.mins}m ${uptime.secs}s`}
          </div>
        </div>
      </div>

      {/* Global Feeds Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#16161B]/60 p-4">
        <span className="text-xs font-medium text-neutral-300">{t('feeds_quick_access')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copyUrl('/iptv/channels.m3u')}
            aria-label={t('copy_m3u_url')}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>M3U Playlist</span>
          </button>
          <button
            type="button"
            onClick={() => copyUrl('/iptv/epg.xml')}
            aria-label={t('copy_epg_url')}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>XMLTV EPG</span>
          </button>
        </div>
      </div>

      {/* Live Monitor Channel Cards */}
      {isChannelsLoading ? (
        <div className="flex min-h-[200px] items-center justify-center text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#0A84FF]" />
        </div>
      ) : channelsError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-400">
          <p className="text-sm">{channelsError.message}</p>
          <button
            type="button"
            onClick={() => refetchChannels()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            {t('retry')}
          </button>
        </div>
      ) : (channels?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-10 text-center">
          <Tv className="mx-auto h-10 w-10 text-neutral-600 mb-3" />
          <h3 className="text-base font-semibold text-[#F5F5F7]">{t('no_channels')}</h3>
          <p className="mt-1 text-xs text-neutral-400">{t('no_channels_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {channels?.map((channel) => (
            <ChannelMonitorCard
              key={channel.id}
              channel={channel}
              status={statuses[channel.id]}
              onSkip={handleSkipChannel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
