import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Copy,
  Cpu,
  Film,
  HardDrive,
  ImageIcon,
  Loader2,
  Radio,
  Tv,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-[#22222A]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-[#F5F5F7] tracking-tight">{title}</h4>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
        <p className="mt-1.5 font-mono text-xs text-[#0A84FF] truncate select-all">{fullUrl}</p>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        aria-label={`${t('copy_url')} ${title}`}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] self-start sm:self-center"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        <span>{t('copy_url')}</span>
      </button>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">{t('system_title')}</h2>
        <p className="mt-1 text-xs text-neutral-400">{t('system_subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="flex min-h-[250px] items-center justify-center text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#0A84FF]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-400">
          <p className="text-sm">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            {t('retry')}
          </button>
        </div>
      ) : (
        <>
          {/* Top Stat Summary Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">
                  {t('stat_media_count')}
                </span>
                <Film className="h-4 w-4 text-[#0A84FF]" />
              </div>
              <div className="text-2xl font-bold text-[#F5F5F7]">{system?.media_count ?? 0}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">
                  {t('stat_total_channels')}
                </span>
                <Tv className="h-4 w-4 text-[#0A84FF]" />
              </div>
              <div className="text-2xl font-bold text-[#F5F5F7]">{system?.channel_count ?? 0}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">
                  {t('stat_running_channels')}
                </span>
                <Radio className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                {system?.running_channels ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">
                  {t('stat_uptime')}
                </span>
                <Clock className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-base font-bold text-[#F5F5F7] truncate">
                {uptime.days > 0
                  ? `${uptime.days} ${t('stat_uptime_days')} ${uptime.hours} ${t('stat_uptime_hours')}`
                  : `${uptime.hours} ${t('stat_uptime_hours')} ${uptime.mins} ${t('stat_uptime_mins')}`}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* FFmpeg Environment Card */}
            <div className="rounded-2xl border border-white/10 bg-[#16161B] p-6 shadow-lg">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
                <Cpu className="h-5 w-5 text-[#0A84FF]" />
                <h3 className="text-base font-semibold text-[#F5F5F7] tracking-tight">
                  {t('ffmpeg_info')}
                </h3>
              </div>

              <div className="space-y-4 text-xs font-mono">
                <div>
                  <span className="block text-neutral-400 font-sans mb-1">{t('ffmpeg_path')}</span>
                  <div className="rounded-xl border border-white/5 bg-[#22222A] p-3 text-neutral-200 select-all">
                    {system?.ffmpeg?.path || '-'}
                  </div>
                </div>

                <div>
                  <span className="block text-neutral-400 font-sans mb-1">
                    {t('ffmpeg_version')}
                  </span>
                  <div className="rounded-xl border border-white/5 bg-[#22222A] p-3 text-neutral-200 select-all whitespace-pre-wrap">
                    {system?.ffmpeg?.version || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Idle Standby Video Card */}
            <div className="rounded-2xl border border-white/10 bg-[#16161B] p-6 shadow-lg">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
                <ImageIcon className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-semibold text-[#F5F5F7] tracking-tight">
                  {t('idle_clip_info')}
                </h3>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="block text-neutral-400 mb-1">{t('idle_clip_status')}</span>
                  <div>
                    {system?.idle_clip?.ready ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> {t('idle_clip_ready')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                        {t('idle_clip_not_ready')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="rounded-xl border border-white/5 bg-[#22222A] p-3">
                    <span className="block text-[11px] text-neutral-400 mb-1">
                      {t('idle_clip_size')}
                    </span>
                    <span className="font-mono text-sm font-semibold text-white">
                      {formatBytes(system?.idle_clip?.size_bytes ?? 0)}
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-[#22222A] p-3">
                    <span className="block text-[11px] text-neutral-400 mb-1">
                      {t('idle_clip_modified')}
                    </span>
                    <span className="font-mono text-xs text-neutral-200 truncate block">
                      {system?.idle_clip?.modified_at
                        ? new Date(system.idle_clip.modified_at).toLocaleString()
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Public IPTV & EPG Feeds Card */}
          <div className="rounded-2xl border border-white/10 bg-[#16161B] p-6 shadow-lg">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
              <HardDrive className="h-5 w-5 text-[#0A84FF]" />
              <h3 className="text-base font-semibold text-[#F5F5F7] tracking-tight">
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
          </div>
        </>
      )}
    </div>
  );
}
