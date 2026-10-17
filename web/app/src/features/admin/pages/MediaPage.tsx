import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowUpDown, Film, Loader2, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import emptyMedia from '../../../assets/empty-media.webp';
import { Button, Card, EmptyState, Input, Select } from '../../../components/ui';
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
          <h2 className="title text-xl font-bold tracking-tight text-fg">{t('media_title')}</h2>
          <p className="mt-1 text-xs text-fg-muted">{t('media_subtitle')}</p>
        </div>

        <Button
          variant="primary"
          onClick={handleStartRescan}
          disabled={isScanning}
          aria-label={t('rescan_library')}
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          <span>{isScanning ? t('rescanning') : t('rescan_library')}</span>
        </Button>
      </div>

      {/* Last scan error banner if any */}
      {lastScanError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-tile border border-danger/30 bg-danger/10 p-4 text-xs text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
          <div>
            <span className="font-semibold">{t('rescan_error')} </span>
            <span>{lastScanError}</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_media')}
            aria-label={t('search_media')}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-fg-subtle shrink-0" />
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort media files"
            className="w-auto"
          >
            <option value="name_asc">{t('sort_name_asc')}</option>
            <option value="name_desc">{t('sort_name_desc')}</option>
            <option value="duration_asc">{t('sort_duration_asc')}</option>
            <option value="duration_desc">{t('sort_duration_desc')}</option>
          </Select>
        </div>
      </div>

      {/* Media Table / Empty State */}
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
            onClick={() => refetchMedia()}
            className="mt-3"
          >
            {t('retry')}
          </Button>
        </div>
      ) : processedMedia.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            art={emptyMedia}
            title={t('no_media_mount')}
            description={t('media_mount_desc')}
            action={
              <Button
                variant="primary"
                onClick={handleStartRescan}
                disabled={isScanning}
                aria-label={t('rescan_library')}
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                <span>{t('rescan_library')}</span>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="w-full">
            <table className="w-full text-left text-sm text-fg block md:table">
              <thead className="hidden md:table-header-group border-b border-hairline bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    {t('col_filename')}
                  </th>
                  <th scope="col" className="px-5 py-3">
                    {t('col_duration')}
                  </th>
                  <th scope="col" className="px-5 py-3">
                    {t('col_video_codec')}
                  </th>
                  <th scope="col" className="px-5 py-3">
                    {t('col_audio_codec')}
                  </th>
                  <th scope="col" className="px-5 py-3">
                    {t('col_resolution')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline block md:table-row-group">
                {processedMedia.map((file) => (
                  <tr
                    key={file.id}
                    className="block md:table-row rounded-tile hover:bg-surface-3/50 transition-colors p-4 md:p-0"
                  >
                    <td className="block md:table-cell px-0 py-1.5 md:px-5 md:py-3.5 font-medium text-fg min-w-0 md:min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <Film className="h-4 w-4 text-accent shrink-0" />
                        <span className="truncate max-w-xs md:max-w-sm" title={file.filename}>
                          {file.filename}
                        </span>
                      </div>
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-5 md:py-3.5 timecode text-fg-muted pr-3">
                      <span className="md:hidden text-fg-subtle font-sans text-[11px] mr-1">
                        {t('col_duration')}:{' '}
                      </span>
                      {formatDuration(file.duration_sec)}
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-5 md:py-3.5 pr-3">
                      <span className="rounded-control bg-surface-2 px-2 py-0.5 uppercase timecode text-xs text-fg-muted border border-hairline">
                        {file.codec_video || '-'}
                      </span>
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-5 md:py-3.5 pr-3">
                      <span className="rounded-control bg-surface-2 px-2 py-0.5 uppercase timecode text-xs text-fg-muted border border-hairline">
                        {file.codec_audio || '-'}
                      </span>
                    </td>
                    <td className="inline-block md:table-cell px-0 py-1 md:px-5 md:py-3.5 timecode text-fg-muted">
                      <span className="rounded-control bg-surface-2 px-2 py-0.5 timecode text-xs text-fg-muted border border-hairline">
                        {file.width > 0 ? `${file.width}x${file.height}` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
