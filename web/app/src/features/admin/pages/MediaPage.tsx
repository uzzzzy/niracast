import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpDown,
  Film,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type ScanStatus } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { formatDuration } from '../utils/playlist';

type SortOption = 'name_asc' | 'name_desc' | 'duration_asc' | 'duration_desc';

export function MediaPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanError, setLastScanError] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data: mediaFiles,
    isLoading,
    error,
    refetch: refetchMedia,
  } = useQuery({
    queryKey: ['admin-media'],
    queryFn: api.getMedia,
  });

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleStartRescan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setLastScanError(null);

    try {
      await api.rescanMedia();
      toast.info(t('rescan_started'));

      stopPolling();
      pollIntervalRef.current = setInterval(async () => {
        try {
          const status: ScanStatus = await api.getMediaScanStatus();
          if (!status.running) {
            stopPolling();
            setIsScanning(false);
            await refetchMedia();

            if (status.last_error) {
              setLastScanError(status.last_error);
              toast.error(`${t('rescan_error')} ${status.last_error}`);
            } else {
              toast.success(t('rescan_finished'));
            }
          }
        } catch {
          // Keep polling unless unmounted
        }
      }, 1000);
    } catch (err: unknown) {
      setIsScanning(false);
      const msg = err instanceof Error ? err.message : 'Rescan request failed';
      setLastScanError(msg);
      toast.error(msg);
    }
  };

  const processedMedia = useMemo(() => {
    if (!mediaFiles) return [];
    let list = [...mediaFiles];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.filename.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.filename.localeCompare(b.filename);
        case 'name_desc':
          return b.filename.localeCompare(a.filename);
        case 'duration_asc':
          return a.duration_sec - b.duration_sec;
        case 'duration_desc':
          return b.duration_sec - a.duration_sec;
        default:
          return 0;
      }
    });

    return list;
  }, [mediaFiles, searchQuery, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">{t('media_title')}</h2>
          <p className="mt-1 text-xs text-neutral-400">{t('media_subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={handleStartRescan}
          disabled={isScanning}
          aria-label={t('rescan_library')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-all hover:bg-[#0071E3] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-50 disabled:pointer-events-none"
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>{isScanning ? t('rescanning') : t('rescan_library')}</span>
        </button>
      </div>

      {/* Last scan error banner if any */}
      {lastScanError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
          <div>
            <span className="font-semibold">{t('rescan_error')} </span>
            <span>{lastScanError}</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_media')}
            aria-label={t('search_media')}
            className="w-full rounded-xl border border-white/10 bg-[#16161B] pl-10 pr-4 py-2.5 text-xs text-[#F5F5F7] placeholder-neutral-500 focus:border-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          />
        </div>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-neutral-400 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort media files"
            className="rounded-xl border border-white/10 bg-[#16161B] px-3 py-2 text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          >
            <option value="name_asc">{t('sort_name_asc')}</option>
            <option value="name_desc">{t('sort_name_desc')}</option>
            <option value="duration_asc">{t('sort_duration_asc')}</option>
            <option value="duration_desc">{t('sort_duration_desc')}</option>
          </select>
        </div>
      </div>

      {/* Media Table / Empty State */}
      {isLoading ? (
        <div className="flex min-h-[250px] items-center justify-center text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#0A84FF]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-400">
          <p className="text-sm">{error.message}</p>
          <button
            type="button"
            onClick={() => refetchMedia()}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            {t('retry')}
          </button>
        </div>
      ) : processedMedia.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#16161B] p-12 text-center">
          <HardDrive className="mx-auto h-12 w-12 text-neutral-600 mb-3" />
          <h3 className="text-base font-semibold text-[#F5F5F7]">{t('no_media_mount')}</h3>
          <p className="mt-1 text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
            {t('media_mount_desc')}
          </p>
          <button
            type="button"
            onClick={handleStartRescan}
            disabled={isScanning}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0071E3] disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t('rescan_library')}</span>
          </button>
        </div>
      ) : (
        <div className="overflow-hidden md:rounded-2xl md:border md:border-white/10 md:bg-[#16161B] md:shadow-lg">
          <div className="w-full">
            <table className="w-full text-left text-sm text-[#F5F5F7] block md:table">
              <thead className="hidden md:table-header-group border-b border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    {t('col_filename')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('col_duration')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('col_video_codec')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('col_audio_codec')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('col_resolution')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-xs block md:table-row-group space-y-3 md:space-y-0">
                {processedMedia.map((file) => (
                  <tr
                    key={file.id}
                    className="block md:table-row rounded-2xl border border-white/10 bg-[#16161B] md:border-0 md:bg-transparent p-4 md:p-0 shadow-sm md:shadow-none hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="block md:table-cell px-0 py-1.5 md:px-6 md:py-4 font-sans font-medium text-white min-w-0 md:min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <Film className="h-4 w-4 text-[#0A84FF] shrink-0" />
                        <span className="truncate max-w-xs md:max-w-sm" title={file.filename}>
                          {file.filename}
                        </span>
                      </div>
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-6 md:py-4 text-neutral-300 pr-3">
                      <span className="md:hidden text-neutral-500 font-sans text-[11px] mr-1">
                        {t('col_duration')}:{' '}
                      </span>
                      {formatDuration(file.duration_sec)}
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-6 md:py-4 pr-3">
                      <span className="rounded bg-white/5 px-2 py-0.5 uppercase text-neutral-300 border border-white/10">
                        {file.codec_video || '-'}
                      </span>
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-6 md:py-4 pr-3">
                      <span className="rounded bg-white/5 px-2 py-0.5 uppercase text-neutral-300 border border-white/10">
                        {file.codec_audio || '-'}
                      </span>
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-6 md:py-4 text-neutral-300">
                      <span className="rounded bg-white/5 px-2 py-0.5 text-neutral-300 border border-white/10">
                        {file.width > 0 ? `${file.width}x${file.height}` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
