import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Loader2, RotateCcw, SkipForward, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import emptyChannels from '../../../assets/empty-channels.webp';
import { Button, Card, ChannelArt, EmptyState, StatTile, StatusPill } from '../../../components/ui';
import { ApiError, api, type Channel, type ChannelStatus } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { DURATION, EASE, getStaggerDelay } from '../../../lib/motion/tokens';
import { useAdminEvents } from '../hooks/useAdminEvents';
import { formatDuration } from '../utils/playlist';

function ChannelMonitorCard({
  channel,
  status,
  onSkip,
}: {
  channel: Channel;
  status?: ChannelStatus & { up_next?: string };
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
  const hasProgress = isPlaying && duration > 0;

  return (
    <Card className="flex flex-col justify-between overflow-hidden p-4 gap-4">
      <div className="space-y-3">
        {/* ChannelArt 16:9 header with rounded-tile & overflow hidden */}
        <ChannelArt
          channelId={channel.id}
          className="aspect-video w-full rounded-tile overflow-hidden relative shadow-sm"
        >
          {/* Channel bug top-left */}
          <span className="absolute top-2.5 left-2.5 timecode text-xs font-bold text-white bg-black/55 px-2 py-0.5 rounded-control border border-white/15">
            #{channel.number}
          </span>

          {/* Badges top-right: restarts, viewers, and playout status */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 flex-wrap justify-end">
            {(status?.restarts ?? 0) > 0 && (
              <span
                data-testid={`channel-restarts-${channel.id}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger/25 text-danger border border-danger/40 select-none shadow-sm"
                title={
                  status?.last_error
                    ? `${status.restarts} restarts: ${status.last_error}`
                    : `${status?.restarts} restarts`
                }
              >
                <RotateCcw className="h-3 w-3" />
                <span>{status?.restarts}</span>
              </span>
            )}
            <span
              data-testid={`channel-viewers-${channel.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-0/85 text-fg border border-hairline select-none font-mono shadow-sm"
              title={`${status?.viewers ?? 0} ${t('viewers_count')}`}
            >
              <Users className="h-3 w-3 text-live" />
              <span>{status?.viewers ?? 0}</span>
            </span>
            {state === 'playing' ? (
              <StatusPill status="onair">{t('badge_playing')}</StatusPill>
            ) : state === 'idle' ? (
              <StatusPill status="idle">{t('badge_idle')}</StatusPill>
            ) : (
              <StatusPill status="stopped">{t('badge_stopped')}</StatusPill>
            )}
          </div>
        </ChannelArt>

        {/* Channel name and now-playing body */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-fg-subtle truncate" title={channel.name}>
            {channel.name}
          </h3>
          <div
            className="title truncate text-fg"
            title={isPlaying ? item?.filename : state === 'idle' ? t('idle_title') : '-'}
          >
            {isPlaying ? item?.filename : state === 'idle' ? t('idle_title') : '-'}
          </div>
        </div>

        {/* Timecode progress row (only if progress data exists) */}
        {hasProgress && (
          <div className="space-y-1.5 pt-1">
            <div className="h-[2px] w-full overflow-hidden rounded-full bg-hairline">
              <div
                className="h-full w-full bg-accent transition-transform duration-300 ease-out origin-left"
                style={{
                  transform: `scaleX(${progressPct / 100})`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs timecode text-fg-muted">
              <span>{formatDuration(currentSeek)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
        )}

        {/* Up next line if data exists */}
        {status?.up_next && (
          <div className="text-xs text-fg-subtle truncate">
            {t('next')}: {status.up_next}
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3">
        <div className="flex items-center gap-2">
          {/* Skip button */}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSkip}
            disabled={!isPlaying || isSkipping || channel.mode === 'scheduled'}
            title={channel.mode === 'scheduled' ? t('skip_unavailable_scheduled') : undefined}
            aria-label={
              channel.mode === 'scheduled' ? t('skip_unavailable_scheduled') : t('skip_button')
            }
          >
            {isSkipping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <SkipForward className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span>{t('skip_button')}</span>
          </Button>

          {/* Copy HLS link */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyHls}
            aria-label={t('copy_hls_url')}
            className="px-2"
          >
            {copySuccess ? <Check className="h-4 w-4 text-live" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {/* Open viewer link */}
        <a
          href={`/watch/${channel.id}`}
          target="_blank"
          rel="noreferrer"
          aria-label={t('open_viewer')}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">{t('open_viewer')}</span>
        </a>
      </div>
    </Card>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const { statuses, refreshChannel } = useAdminEvents();

  const { data: system } = useQuery({
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

  const totalChannels = channels?.length ?? system?.channel_count ?? 0;
  const playingCount = channels
    ? channels.filter((c) => statuses[c.id]?.state === 'playing').length
    : (system?.running_channels ?? 0);
  const idleCount = channels ? channels.filter((c) => statuses[c.id]?.state === 'idle').length : 0;
  const stoppedCount = channels
    ? channels.filter((c) => !statuses[c.id] || statuses[c.id]?.state === 'stopped').length
    : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="title text-xl font-bold tracking-tight text-fg">{t('overview_title')}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t('overview_subtitle')}</p>
      </div>

      {/* Top stat tiles (Control room bento) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={t('stat_total_channels')}
          value={isChannelsLoading ? '...' : totalChannels}
          tone="neutral"
        />
        <StatTile
          label={t('stat_running_channels')}
          value={isChannelsLoading ? '...' : playingCount}
          tone="onair"
        />
        <StatTile label={t('standby')} value={isChannelsLoading ? '...' : idleCount} tone="idle" />
        <StatTile
          label={t('badge_stopped')}
          value={isChannelsLoading ? '...' : stoppedCount}
          tone="neutral"
        />
      </div>

      {/* Global Feeds Bar */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <span className="text-xs font-medium text-fg-muted">{t('feeds_quick_access')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => copyUrl('/iptv/channels.m3u')}
            aria-label={t('copy_m3u_url')}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            <span>M3U Playlist</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => copyUrl('/iptv/epg.xml')}
            aria-label={t('copy_epg_url')}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            <span>XMLTV EPG</span>
          </Button>
        </div>
      </Card>

      {/* Live Monitor Channel Cards */}
      {isChannelsLoading ? (
        <div className="flex min-h-[200px] items-center justify-center text-fg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : channelsError ? (
        <div className="rounded-tile border border-danger/30 bg-danger/10 p-6 text-center text-danger">
          <p className="text-sm">{channelsError.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refetchChannels()}
            className="mt-3"
          >
            {t('retry')}
          </Button>
        </div>
      ) : (channels?.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState
            art={emptyChannels}
            title={t('no_channels')}
            description={t('no_channels_desc')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {channels?.map((channel, idx) => (
              <motion.div
                key={channel.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  duration: DURATION.normal,
                  delay: getStaggerDelay(idx, 0.03),
                  ease: EASE.spring,
                }}
              >
                <ChannelMonitorCard
                  channel={channel}
                  status={statuses[channel.id]}
                  onSkip={handleSkipChannel}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
