import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
  ListMusic,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { api, type MediaFile } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
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
      className={`group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#16161B] p-3 text-sm transition-colors hover:border-white/20 ${
        isDragging ? 'border-[#0A84FF] shadow-2xl bg-[#22222A]' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Reorder item"
          className="cursor-grab touch-none p-1 text-neutral-500 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] rounded"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5 font-mono text-[11px] font-semibold text-neutral-400">
          {index + 1}
        </span>
        <span className="truncate font-medium text-[#F5F5F7]" title={item.filename}>
          {item.filename}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-xs text-neutral-400">
          {formatDuration(item.duration_sec)}
        </span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={t('remove_from_playlist')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-400 hover:bg-red-500/10 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const TIMELINE_COLORS = [
  '#0A84FF',
  '#30D158',
  '#BF5AF2',
  '#FF9F0A',
  '#64D2FF',
  '#FF453A',
  '#FFD60A',
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
          <button
            type="button"
            onClick={handleBack}
            aria-label={t('back_to_channels_list')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-[#0A84FF]">
                #{channel?.number ?? channelId}
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">
                {channel?.name || t('playlist_editor_title')}
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-3.5 w-3.5 text-neutral-500" />
                {t('total_duration')}: {formatDuration(totalDuration, true)}
              </span>
              <span>•</span>
              <span>
                {playlistItems.length} {t('item_count')}
              </span>
              {isDirty && (
                <>
                  <span>•</span>
                  <span className="font-medium text-amber-400">{t('unsaved_changes')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <button
            type="button"
            onClick={handleRevert}
            disabled={!isDirty || isSaving}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-40 disabled:pointer-events-none"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t('revert_playlist')}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all hover:bg-[#0071E3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{isSaving ? t('saving_playlist') : t('save_playlist')}</span>
          </button>
        </div>
      </div>

      {/* Loop Timeline Bar */}
      <div className="rounded-2xl border border-white/10 bg-[#16161B] p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-400 font-medium">
          <span>{t('loop_timeline')}</span>
          <span className="font-mono">{formatDuration(totalDuration, true)}</span>
        </div>
        <div
          className="relative flex h-5 w-full overflow-hidden rounded-lg bg-black/40 border border-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-valuenow={totalDuration}
        >
          {totalDuration === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">
              {t('empty_playlist')}
            </div>
          ) : (
            playlistItems.map((item, idx) => {
              const widthPct = (item.duration_sec / totalDuration) * 100;
              const color = TIMELINE_COLORS[idx % TIMELINE_COLORS.length];
              return (
                <div
                  key={item.instanceId}
                  style={{
                    width: `${Math.max(0.5, widthPct)}%`,
                    backgroundColor: color,
                  }}
                  className="h-full border-r border-black/40 transition-all hover:brightness-125 cursor-pointer opacity-85 hover:opacity-100"
                  title={`${item.filename} (${formatDuration(item.duration_sec)})`}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Two-Pane Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 min-h-[500px]">
        {/* Left Pane: Media Library (5 cols) */}
        <section
          aria-label={t('media_library_pane')}
          className="flex flex-col rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-lg lg:col-span-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#F5F5F7] tracking-tight mb-2">
              {t('media_library_pane')}
            </h3>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_media_placeholder')}
                className="w-full rounded-xl border border-white/10 bg-[#22222A] pl-10 pr-4 py-2.5 text-xs text-[#F5F5F7] placeholder-neutral-500 focus:border-[#0A84FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[550px]">
            {isMediaLoading ? (
              <div className="flex h-32 items-center justify-center text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin text-[#0A84FF]" />
              </div>
            ) : filteredMedia.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                <Film className="mx-auto h-8 w-8 text-neutral-600 mb-2" />
                <span>{t('no_media_found')}</span>
              </div>
            ) : (
              filteredMedia.map((media) => (
                <div
                  key={media.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#22222A]/60 p-3 text-xs transition-colors hover:border-white/20 hover:bg-[#22222A]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-200" title={media.filename}>
                      {media.filename}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400 font-mono">
                      <span>{formatDuration(media.duration_sec)}</span>
                      <span>•</span>
                      <span className="rounded bg-white/10 px-1 py-0.5">
                        {media.codec_video.toUpperCase()}
                      </span>
                      <span className="rounded bg-white/10 px-1 py-0.5">
                        {media.codec_audio.toUpperCase()}
                      </span>
                      {media.width > 0 && (
                        <span>
                          {media.width}x{media.height}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddMedia(media)}
                    aria-label={`${t('add_to_playlist')} ${media.filename}`}
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-white/5 text-neutral-300 hover:bg-[#0A84FF] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right Pane: Playlist with dnd-kit Sortable (7 cols) */}
        <section
          aria-label={t('playlist_pane')}
          className="flex flex-col rounded-2xl border border-white/10 bg-[#16161B] p-5 shadow-lg lg:col-span-7"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F5F5F7] tracking-tight">
              {t('playlist_pane')}
            </h3>
            <span className="font-mono text-xs text-neutral-400">
              {playlistItems.length} {t('item_count')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 max-h-[550px]">
            {isPlaylistLoading ? (
              <div className="flex h-32 items-center justify-center text-neutral-400">
                <Loader2 className="h-5 w-5 animate-spin text-[#0A84FF]" />
              </div>
            ) : playlistItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
                <ListMusic className="h-10 w-10 text-neutral-600 mb-2" />
                <p className="text-sm font-medium text-neutral-300">{t('empty_playlist')}</p>
                <p className="mt-1 text-xs text-neutral-500 max-w-xs">{t('empty_playlist_desc')}</p>
              </div>
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
                    {playlistItems.map((item, index) => (
                      <SortableItem
                        key={item.instanceId}
                        item={item}
                        index={index}
                        onRemove={handleRemoveItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
