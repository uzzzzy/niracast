import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Cpu, HardDrive, ImageIcon, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, StatTile, StatusPill } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { parseUptime } from '../utils/playlist';

function FeedUrlItem({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${origin}${path}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success(t('copied_to_clipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-tile border border-hairline bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h4 className="title text-sm font-semibold text-fg tracking-tight">{title}</h4>
        <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
        <p className="mt-1.5 timecode text-xs text-accent truncate select-all">{fullUrl}</p>
      </div>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        aria-label={`${t('copy_url')} ${title}`}
        className="self-start sm:self-center"
      >
        {copied ? (
          <Check className="h-4 w-4 text-live mr-1.5" />
        ) : (
          <Copy className="h-4 w-4 mr-1.5" />
        )}
        <span>{t('copy_url')}</span>
      </Button>
    </div>
  );
}

export function SystemPage() {
  const { t } = useTranslation();

  const {
    data: system,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
  });

  const uptime = parseUptime(system?.uptime_sec ?? 0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  // Large numerals with small unit labels keep the tile value on one line.
  const unit = (label: string) => (
    <span className="font-sans text-sm font-medium text-fg-muted"> {label} </span>
  );
  const uptimeString =
    uptime.days > 0 ? (
      <span className="whitespace-nowrap">
        {uptime.days}
        {unit(t('stat_uptime_days'))}
        {uptime.hours}
        {unit(t('stat_uptime_hours'))}
      </span>
    ) : (
      <span className="whitespace-nowrap">
        {uptime.hours}
        {unit(t('stat_uptime_hours'))}
        {uptime.mins}
        {unit(t('stat_uptime_mins'))}
      </span>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="title text-xl font-bold tracking-tight text-fg">{t('system_title')}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t('system_subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="flex min-h-[250px] items-center justify-center text-fg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : error ? (
        <div className="rounded-tile border border-danger/30 bg-danger/10 p-6 text-center text-danger">
          <p className="text-sm">{error.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            className="mt-3"
          >
            {t('retry')}
          </Button>
        </div>
      ) : (
        <>
          {/* Top Stat Summary Grid */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label={t('stat_media_count')}
              value={system?.media_count ?? 0}
              tone="neutral"
            />
            <StatTile
              label={t('stat_total_channels')}
              value={system?.channel_count ?? 0}
              tone="neutral"
            />
            <StatTile
              label={t('stat_running_channels')}
              value={system?.running_channels ?? 0}
              tone={system?.running_channels ? 'live' : 'neutral'}
            />
            <StatTile label={t('stat_uptime')} value={uptimeString} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* FFmpeg Environment Card */}
            <Card className="p-6">
              <div className="flex items-center gap-3 border-b border-hairline pb-4 mb-4">
                <Cpu className="h-5 w-5 text-accent" />
                <h3 className="title text-base font-semibold text-fg tracking-tight">
                  {t('ffmpeg_info')}
                </h3>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="block text-fg-subtle label-caps mb-1.5">{t('ffmpeg_path')}</span>
                  <div className="rounded-control border border-hairline bg-surface-2 p-3 timecode text-fg select-all">
                    {system?.ffmpeg?.path || '-'}
                  </div>
                </div>

                <div>
                  <span className="block text-fg-subtle label-caps mb-1.5">
                    {t('ffmpeg_version')}
                  </span>
                  <div className="rounded-control border border-hairline bg-surface-2 p-3 timecode text-fg select-all whitespace-pre-wrap">
                    {system?.ffmpeg?.version || '-'}
                  </div>
                </div>
              </div>
            </Card>

            {/* Idle Standby Video Card */}
            <Card className="p-6">
              <div className="flex items-center gap-3 border-b border-hairline pb-4 mb-4">
                <ImageIcon className="h-5 w-5 text-idle" />
                <h3 className="title text-base font-semibold text-fg tracking-tight">
                  {t('idle_clip_info')}
                </h3>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="block text-fg-subtle label-caps mb-1.5">
                    {t('idle_clip_status')}
                  </span>
                  <div>
                    {system?.idle_clip?.ready ? (
                      <StatusPill status="live">{t('idle_clip_ready')}</StatusPill>
                    ) : (
                      <StatusPill status="error">{t('idle_clip_not_ready')}</StatusPill>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="rounded-control border border-hairline bg-surface-2 p-3">
                    <span className="block label-caps text-fg-subtle mb-1">
                      {t('idle_clip_size')}
                    </span>
                    <span className="timecode text-sm font-semibold text-fg">
                      {formatBytes(system?.idle_clip?.size_bytes ?? 0)}
                    </span>
                  </div>

                  <div className="rounded-control border border-hairline bg-surface-2 p-3">
                    <span className="block label-caps text-fg-subtle mb-1">
                      {t('idle_clip_modified')}
                    </span>
                    <span className="timecode text-xs text-fg-muted truncate block">
                      {system?.idle_clip?.modified_at
                        ? new Date(system.idle_clip.modified_at).toLocaleString()
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Public IPTV & EPG Feeds Card */}
          <Card className="p-6">
            <div className="flex items-center gap-3 border-b border-hairline pb-4 mb-4">
              <HardDrive className="h-5 w-5 text-accent" />
              <h3 className="title text-base font-semibold text-fg tracking-tight">
                {t('feeds_info')}
              </h3>
            </div>

            <div className="space-y-3">
              <FeedUrlItem
                title="IPTV M3U Playlist"
                description={t('feed_m3u_desc')}
                path="/iptv/channels.m3u"
              />
              <FeedUrlItem
                title="XMLTV Electronic Program Guide (EPG)"
                description={t('feed_epg_desc')}
                path="/iptv/epg.xml"
              />
              <FeedUrlItem
                title="Sample Channel 1 HLS Stream"
                description={t('feed_hls_desc')}
                path="/channels/1/live.m3u8"
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
