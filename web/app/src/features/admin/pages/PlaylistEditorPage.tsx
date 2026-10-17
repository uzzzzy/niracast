import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  Film,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import emptyPlaylist from '../../../assets/empty-playlist.webp';
import { Button, Card, EmptyState, Input } from '../../../components/ui';
import { api, type MediaFile } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { DURATION, EASE } from '../../../lib/motion/tokens';
import { cn } from '../../../lib/utils';
import {
  addToPlaylist,
  calculateTotalDuration,
  formatDuration,
  removeFromPlaylist,
  reorderPlaylist,
} from '../utils/playlist';

interface UIPlaylistItem {
  instanceId: string;
  media_id: number;
  filename: string;
  duration_sec: number;
}

function SortableItem({
  item,
  index,
  onRemove,
}: {
  item: UIPlaylistItem;
  index: number;
  onRemove: (idx: number) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.instanceId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-tile border border-hairline p-3 text-sm transition-colors',
        isDragging
          ? 'bg-surface-3 ring-1 ring-accent shadow-[var(--shadow-2)]'
          : 'bg-surface-2 hover:bg-surface-3/50',
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Reorder item"
          className="cursor-grab touch-none flex min-h-[44px] min-w-[44px] items-center justify-center p-1 text-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-surface-3 timecode text-[11px] font-semibold text-fg-muted">
          {index + 1}
        </span>
        <span className="truncate font-medium text-fg" title={item.filename}>
          {item.filename}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="timecode text-xs text-fg-muted">{formatDuration(item.duration_sec)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          aria-label={t('remove_from_playlist')}
          className="hover:text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const TIMELINE_CLASSES = [
  'bg-accent',
  'bg-live',
  'bg-accent/80',
  'bg-idle',
  'bg-live/80',
  'bg-accent/60',
  'bg-idle/80',
];

export function PlaylistEditorPage() {
  const { id } = useParams<{ id: string }>();
  const channelId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [playlistItems, setPlaylistItems] = useState<UIPlaylistItem[]>([]);
  const [savedMediaIds, setSavedMediaIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Load Channel info
  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => api.getChannel(channelId),
    enabled: !Number.isNaN(channelId),
  });

  // Load Channel Playlist
  const {
    data: playlistData,
    isLoading: isPlaylistLoading,
    refetch: refetchPlaylist,
  } = useQuery({
    queryKey: ['channel-playlist', channelId],
    queryFn: () => api.getChannelPlaylist(channelId),
    enabled: !Number.isNaN(channelId),
  });

  // Load Media files library
  const { data: mediaFiles, isLoading: isMediaLoading } = useQuery({
    queryKey: ['admin-media'],
    queryFn: api.getMedia,
  });

  // Sync playlistData to local state
  useEffect(() => {
    if (playlistData) {
      const items: UIPlaylistItem[] = playlistData.items.map((it, idx) => ({
        instanceId: `item-${it.media_id}-${idx}-${Date.now()}-${Math.random()}`,
        media_id: it.media_id,
        filename: it.filename,
        duration_sec: it.duration_sec,
      }));
      setPlaylistItems(items);
      setSavedMediaIds(playlistData.items.map((i) => i.media_id));
    }
  }, [playlistData]);

  // Check dirty state
  const isDirty = useMemo(() => {
    const currentIds = playlistItems.map((i) => i.media_id);
    if (currentIds.length !== savedMediaIds.length) return true;
    for (let i = 0; i < currentIds.length; i++) {
      if (currentIds[i] !== savedMediaIds[i]) return true;
    }
    return false;
  }, [playlistItems, savedMediaIds]);

  // Warn on page unload when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleBack = () => {
    if (isDirty) {
      const confirmLeave = window.confirm(t('warn_unsaved_leave'));
      if (!confirmLeave) return;
    }
    navigate('/admin/channels');
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = playlistItems.findIndex((item) => item.instanceId === active.id);
      const newIndex = playlistItems.findIndex((item) => item.instanceId === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setPlaylistItems((items) => reorderPlaylist(items, oldIndex, newIndex));
      }
    }
  };

  const handleAddMedia = (media: MediaFile) => {
    const newItem: UIPlaylistItem = {
      instanceId: `item-${media.id}-${Date.now()}-${Math.random()}`,
      media_id: media.id,
      filename: media.filename,
      duration_sec: media.duration_sec,
    };
    setPlaylistItems((items) => addToPlaylist(items, newItem));
  };

  const handleRemoveItem = (index: number) => {
    setPlaylistItems((items) => removeFromPlaylist(items, index));
  };

  const handleRevert = () => {
    if (playlistData) {
      const items: UIPlaylistItem[] = playlistData.items.map((it, idx) => ({
        instanceId: `item-${it.media_id}-${idx}-${Date.now()}-${Math.random()}`,
        media_id: it.media_id,
        filename: it.filename,
        duration_sec: it.duration_sec,
      }));
      setPlaylistItems(items);
    }
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      const mediaIds = playlistItems.map((item) => item.media_id);
      await api.setChannelPlaylist(channelId, mediaIds);
      toast.success(t('playlist_saved'));
      await refetchPlaylist();
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
      queryClient.invalidateQueries({ queryKey: ['system-info'] });
    } catch {
      toast.error(t('playlist_save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const totalDuration = calculateTotalDuration(playlistItems);

  // Filter media files by search input
  const filteredMedia = useMemo(() => {
    if (!mediaFiles) return [];
    if (!searchQuery.trim()) return mediaFiles;
    const q = searchQuery.toLowerCase();
    return mediaFiles.filter((m) => m.filename.toLowerCase().includes(q));
  }, [mediaFiles, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleBack}
            aria-label={t('back_to_channels_list')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="timecode text-xs font-bold px-2 py-0.5 rounded-control bg-surface-2 border border-hairline text-accent">
                #{channel?.number ?? channelId}
              </span>
              <h2 className="title text-xl font-bold tracking-tight text-fg">
                {channel?.name || t('playlist_editor_title')}
              </h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-fg-muted">
              <span className="flex items-center gap-1 timecode">
                <Clock className="h-3.5 w-3.5 text-fg-subtle" />
                {t('total_duration')}: {formatDuration(totalDuration, true)}
              </span>
              <span>•</span>
              <span className="timecode">
                {playlistItems.length} {t('item_count')}
              </span>
              {isDirty && (
                <>
                  <span>•</span>
                  <span className="font-medium text-idle">{t('unsaved_changes')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <Button variant="secondary" onClick={handleRevert} disabled={!isDirty || isSaving}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            <span>{t('revert_playlist')}</span>
          </Button>

          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            aria-label={t('save_playlist')}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            <span>{isSaving ? t('saving_playlist') : t('save_playlist')}</span>
          </Button>
        </div>
      </div>

      {/* Loop Timeline Bar */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-fg-muted font-medium">
          <span>{t('loop_timeline')}</span>
          <span className="timecode">{formatDuration(totalDuration, true)}</span>
        </div>
        <div
          className="relative flex h-5 w-full overflow-hidden rounded-control bg-surface-0 border border-hairline"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-valuenow={totalDuration}
        >
          {totalDuration === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-fg-subtle">
              {t('empty_playlist')}
            </div>
          ) : (
            playlistItems.map((item, idx) => {
              const widthPct = (item.duration_sec / totalDuration) * 100;
              return (
                <div
                  key={item.instanceId}
                  style={{
                    width: `${Math.max(0.5, widthPct)}%`,
                  }}
                  className="h-full border-r border-black/30 overflow-hidden"
                  title={`${item.filename} (${formatDuration(item.duration_sec)})`}
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DURATION.normal, ease: EASE.spring }}
                    style={{
                      transformOrigin: 'left',
                    }}
                    className={cn(
                      'h-full w-full hover:brightness-125 cursor-pointer opacity-85 hover:opacity-100',
                      TIMELINE_CLASSES[idx % TIMELINE_CLASSES.length],
                    )}
                  />
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Two-Pane Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 min-h-[500px]">
        {/* Left Pane: Media Library (5 cols) */}
        <Card
          as="section"
          aria-label={t('media_library_pane')}
          className="flex flex-col p-5 lg:col-span-5"
        >
          <div className="mb-4 space-y-2">
            <h3 className="title text-sm font-semibold text-fg tracking-tight">
              {t('media_library_pane')}
            </h3>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_media_placeholder')}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[550px]">
            {isMediaLoading ? (
              <div className="flex h-32 items-center justify-center text-fg-muted">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            ) : filteredMedia.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-muted">
                <Film className="mx-auto h-8 w-8 text-fg-subtle mb-2" />
                <span>{t('no_media_found')}</span>
              </div>
            ) : (
              filteredMedia.map((media) => (
                <div
                  key={media.id}
                  className="flex items-center justify-between gap-3 rounded-tile border border-hairline bg-surface-2 p-3 text-xs transition-colors hover:bg-surface-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg" title={media.filename}>
                      {media.filename}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-fg-muted timecode">
                      <span>{formatDuration(media.duration_sec)}</span>
                      <span>•</span>
                      <span className="rounded bg-surface-3 px-1 py-0.5">
                        {media.codec_video.toUpperCase()}
                      </span>
                      <span className="rounded bg-surface-3 px-1 py-0.5">
                        {media.codec_audio.toUpperCase()}
                      </span>
                      {media.width > 0 && (
                        <span>
                          {media.width}x{media.height}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => handleAddMedia(media)}
                    aria-label={`${t('add_to_playlist')} ${media.filename}`}
                    className="shrink-0 hover:bg-accent hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right Pane: Playlist with dnd-kit Sortable (7 cols) */}
        <Card
          as="section"
          aria-label={t('playlist_pane')}
          className="flex flex-col p-5 lg:col-span-7"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="title text-sm font-semibold text-fg tracking-tight">
              {t('playlist_pane')}
            </h3>
            <span className="timecode text-xs text-fg-muted">
              {playlistItems.length} {t('item_count')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 max-h-[550px]">
            {isPlaylistLoading ? (
              <div className="flex h-32 items-center justify-center text-fg-muted">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            ) : playlistItems.length === 0 ? (
              <EmptyState
                art={emptyPlaylist}
                title={t('empty_playlist')}
                description={t('empty_playlist_desc')}
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={playlistItems.map((i) => i.instanceId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {playlistItems.map((item, index) => (
                        <motion.div
                          key={item.instanceId}
                          layout="position"
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: DURATION.fast, ease: EASE.spring }}
                        >
                          <SortableItem item={item} index={index} onRemove={handleRemoveItem} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
