import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Eye, HardDrive, RefreshCw, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AreaChart,
  BarChart,
  Card,
  SegmentedControl,
  type SegmentedControlOption,
  StatTile,
} from '../../../components/ui';
import { type AnalyticsRange, api } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { useAdminEvents } from '../hooks/useAdminEvents';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / 1024 ** i;
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i] || 'B'}`;
}

function formatWatchDuration(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0s';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatPointLabel(tsStr: string, range: AnalyticsRange, lang: string): string {
  try {
    const d = new Date(tsStr);
    if (Number.isNaN(d.getTime())) return tsStr;
    if (range === '1h' || range === '24h') {
      return d.toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return tsStr;
  }
}

function formatFullTimestamp(tsStr: string, lang: string): string {
  try {
    const d = new Date(tsStr);
    if (Number.isNaN(d.getTime())) return tsStr;
    return d.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false,
    });
  } catch {
    return tsStr;
  }
}

export function AnalyticsPage() {
  const { t, lang } = useTranslation();
  const { statuses, totalViewers: sseTotalViewers } = useAdminEvents();
  const [range, setRange] = useState<AnalyticsRange>('24h');
  const [selectedChannelId, setSelectedChannelId] = useState<number>(0);

  const { data: channels } = useQuery({
    queryKey: ['admin-channels'],
    queryFn: api.getChannels,
  });

  const { data: liveData } = useQuery({
    queryKey: ['analytics-live'],
    queryFn: api.getAnalyticsLive,
    refetchInterval: 10000,
  });

  const { data: timeseriesData, isLoading: isTimeseriesLoading } = useQuery({
    queryKey: ['analytics-timeseries', range, selectedChannelId],
    queryFn: () => api.getAnalyticsTimeseries(range, selectedChannelId),
  });

  const { data: topMediaData } = useQuery({
    queryKey: ['analytics-top-media', range],
    queryFn: () => api.getAnalyticsTopMedia(range),
  });

  // Calculate live concurrency
  const currentViewers = useMemo(() => {
    if (selectedChannelId === 0) {
      if (typeof sseTotalViewers === 'number' && sseTotalViewers > 0) {
        return sseTotalViewers;
      }
      return liveData?.total_viewers ?? 0;
    }
    return (
      statuses[selectedChannelId]?.viewers ??
      liveData?.channels.find((c) => c.channel_id === selectedChannelId)?.viewers ??
      0
    );
  }, [selectedChannelId, sseTotalViewers, liveData, statuses]);

  // Aggregate timeseries statistics
  const { peakViewers, totalBytes, totalWatchSec } = useMemo(() => {
    const pts = timeseriesData?.points ?? [];
    let peak = 0;
    let bytes = 0;
    let sec = 0;
    for (const p of pts) {
      if (p.viewers_peak > peak) peak = p.viewers_peak;
      bytes += p.bytes_out;
      sec += p.watch_sec;
    }
    return { peakViewers: peak, totalBytes: bytes, totalWatchSec: sec };
  }, [timeseriesData]);

  // Format chart points
  const viewersChartData = useMemo(() => {
    return (timeseriesData?.points ?? []).map((p) => ({
      label: formatPointLabel(p.ts, range, lang),
      value: p.viewers_peak,
      date: formatFullTimestamp(p.ts, lang),
    }));
  }, [timeseriesData, range, lang]);

  const bandwidthChartData = useMemo(() => {
    return (timeseriesData?.points ?? []).map((p) => ({
      label: formatPointLabel(p.ts, range, lang),
      value: p.bytes_out,
      date: formatFullTimestamp(p.ts, lang),
    }));
  }, [timeseriesData, range, lang]);

  const topMediaItems = useMemo(() => {
    return (topMediaData?.items ?? []).map((it) => ({
      id: it.media_id,
      label: it.title,
      value: it.watch_sec,
      formattedValue: formatWatchDuration(it.watch_sec),
    }));
  }, [topMediaData]);

  const rangeOptions: SegmentedControlOption<AnalyticsRange>[] = [
    { value: '1h', label: t('analytics_range_1h') },
    { value: '24h', label: t('analytics_range_24h') },
    { value: '7d', label: t('analytics_range_7d') },
    { value: '30d', label: t('analytics_range_30d') },
  ];

  const rangeHintLabels: Record<AnalyticsRange, string> = {
    '1h': t('analytics_range_1h'),
    '24h': t('analytics_range_24h'),
    '7d': t('analytics_range_7d'),
    '30d': t('analytics_range_30d'),
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="title text-xl font-bold tracking-tight text-fg">{t('analytics_title')}</h2>
          <p className="mt-1 text-xs text-fg-muted">{t('analytics_subtitle')}</p>
        </div>

        {/* Range Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Channel selector filter if multiple channels exist */}
          {channels && channels.length > 1 && (
            <div className="flex items-center">
              <select
                aria-label={t('analytics_channel_column')}
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(Number(e.target.value))}
                className="h-8 rounded-control border border-hairline bg-surface-2 px-2.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value={0}>{t('analytics_filter_all_channels')}</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.number} {ch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <SegmentedControl
            options={rangeOptions}
            value={range}
            onChange={(val) => setRange(val)}
            ariaLabel="Analytics range"
          />
        </div>
      </div>

      {/* Top Stat Tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={t('analytics_current_viewers')}
          value={currentViewers}
          tone="live"
          hint={t('live_status_connected')}
        />
        <StatTile
          label={t('analytics_peak_viewers')}
          value={isTimeseriesLoading ? '...' : peakViewers}
          tone="onair"
          hint={rangeHintLabels[range]}
        />
        <StatTile
          label={t('analytics_total_bandwidth')}
          value={isTimeseriesLoading ? '...' : formatBytes(totalBytes)}
          tone="neutral"
        />
        <StatTile
          label={t('analytics_total_watch_time')}
          value={isTimeseriesLoading ? '...' : formatWatchDuration(totalWatchSec)}
          tone="idle"
        />
      </div>

      {/* Charts Bento Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Viewers Chart Card */}
        <Card className="flex flex-col justify-between p-5 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-fg">
                  {t('analytics_viewers_chart_title')}
                </h3>
              </div>
              <span className="label-caps font-mono">{t('viewers_count')}</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{t('analytics_viewers_chart_desc')}</p>
          </div>

          <div className="pt-2 min-h-[220px]">
            <AreaChart
              data={viewersChartData}
              color="var(--accent)"
              height={220}
              formatValue={(v) => `${Math.round(v)}`}
              emptyMessage={t('analytics_no_data')}
              ariaLabel={t('analytics_viewers_chart_title')}
            />
          </div>
        </Card>

        {/* Bandwidth Chart Card */}
        <Card className="flex flex-col justify-between p-5 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-live" />
                <h3 className="text-sm font-semibold text-fg">
                  {t('analytics_bandwidth_chart_title')}
                </h3>
              </div>
              <span className="label-caps font-mono">{t('analytics_total_bandwidth')}</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{t('analytics_bandwidth_chart_desc')}</p>
          </div>

          <div className="pt-2 min-h-[220px]">
            <AreaChart
              data={bandwidthChartData}
              color="var(--live)"
              height={220}
              formatValue={formatBytes}
              emptyMessage={t('analytics_no_data')}
              ariaLabel={t('analytics_bandwidth_chart_title')}
            />
          </div>
        </Card>
      </div>

      {/* Top Media Section */}
      <Card className="p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-idle" />
              <h3 className="text-sm font-semibold text-fg">{t('analytics_top_media_title')}</h3>
            </div>
            <span className="label-caps font-mono">Top 10</span>
          </div>
          <p className="mt-1 text-xs text-fg-muted">{t('analytics_top_media_desc')}</p>
        </div>

        <div className="pt-2">
          <BarChart
            items={topMediaItems}
            color="var(--idle)"
            formatValue={formatWatchDuration}
            emptyMessage={t('analytics_no_top_media')}
            ariaLabel={t('analytics_top_media_title')}
            maxBars={10}
          />
        </div>
      </Card>

      {/* Channel Playout Health Table */}
      {channels && channels.length > 0 && (
        <Card className="p-5 space-y-4 overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-fg">
                  {t('analytics_channels_health_title')}
                </h3>
              </div>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{t('analytics_channels_health_desc')}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-hairline text-fg-subtle">
                  <th className="pb-2 font-medium">{t('analytics_channel_column')}</th>
                  <th className="pb-2 font-medium text-center">{t('analytics_viewers_column')}</th>
                  <th className="pb-2 font-medium text-center">{t('analytics_restarts_column')}</th>
                  <th className="pb-2 font-medium">{t('analytics_last_error_column')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {channels.map((ch) => {
                  const st = statuses[ch.id];
                  const liveCh = liveData?.channels.find((c) => c.channel_id === ch.id);
                  const viewers = st?.viewers ?? liveCh?.viewers ?? 0;
                  const restarts = st?.restarts ?? liveCh?.restarts ?? 0;
                  const lastErr = st?.last_error || liveCh?.last_error || '';

                  return (
                    <tr key={ch.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="py-2.5 font-medium text-fg">
                        <span className="font-mono text-fg-subtle mr-2">#{ch.number}</span>
                        {ch.name}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 font-mono font-medium text-fg">
                          <Eye className="h-3 w-3 text-live" />
                          {viewers}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        {restarts > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger border border-danger/30"
                            title={lastErr || `${restarts} restarts`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {restarts}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-fg-subtle font-mono">
                            0
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2.5 text-fg-muted font-mono truncate max-w-[200px]"
                        title={lastErr}
                      >
                        {lastErr ? (
                          <span className="text-danger">{lastErr}</span>
                        ) : (
                          <span className="text-fg-subtle italic">{t('analytics_healthy')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
