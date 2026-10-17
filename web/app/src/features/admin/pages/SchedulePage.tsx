import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Plus,
  Radio,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import emptyPlaylistArt from '../../../assets/empty-playlist.webp';
import { Button, Card, EmptyState, SegmentedControl } from '../../../components/ui';
import { api, type ScheduleOccurrence, type ScheduleSlot, type SlotInput } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { ScheduleTimeline } from '../schedule/ScheduleTimeline';
import { SlotModal } from '../schedule/SlotModal';
import {
  getStartOfDay,
  getWeekStartMonday,
  getZonedParts,
  utcToWallClock,
} from '../schedule/scheduleUtils';

export function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const channelId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang } = useTranslation();

  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [showTimelineAnyway, setShowTimelineAnyway] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState<ScheduleSlot | null>(null);
  const [initialStartISO, setInitialStartISO] = useState<string | null>(null);

  // Load Channel details
  const {
    data: channel,
    isLoading: isChannelLoading,
    error: channelError,
    refetch: refetchChannel,
  } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => api.getChannel(channelId),
    enabled: !Number.isNaN(channelId),
  });

  // Load System info for timezone
  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
  });

  const timezone = systemInfo?.timezone || 'Asia/Jakarta';

  // Compute date range based on view and anchor
  const { from, to, anchorDay, dateRangeLabel } = useMemo(() => {
    if (view === 'day') {
      const dayStart = getStartOfDay(anchorDate, timezone);
      const nextDayStart = new Date(dayStart.getTime() + 24 * 3600 * 1000);
      const parts = getZonedParts(dayStart, timezone);
      const wall = utcToWallClock(dayStart, timezone);

      const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
      const dateLabel = d.toLocaleDateString(lang === 'en' ? 'en-US' : 'id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });

      return {
        from: dayStart,
        to: nextDayStart,
        anchorDay: wall.dateStr,
        dateRangeLabel: dateLabel,
      };
    }

    // Week view (Mon–Sun)
    const mondayStart = getWeekStartMonday(anchorDate, timezone);
    const nextMondayStart = new Date(mondayStart.getTime() + 7 * 24 * 3600 * 1000);
    const sundayEnd = new Date(mondayStart.getTime() + 6 * 24 * 3600 * 1000);

    const mParts = getZonedParts(mondayStart, timezone);
    const sParts = getZonedParts(sundayEnd, timezone);
    const wall = utcToWallClock(mondayStart, timezone);

    const label = `${mParts.day} ${mParts.month === sParts.month ? '' : mParts.month} – ${sParts.day}/${sParts.month}/${sParts.year}`;

    return {
      from: mondayStart,
      to: nextMondayStart,
      anchorDay: wall.dateStr,
      dateRangeLabel: label,
    };
  }, [view, anchorDate, timezone, lang]);

  // Fetch schedule
  const {
    data: scheduleData,
    isLoading: isScheduleLoading,
    error: scheduleError,
    refetch: refetchSchedule,
  } = useQuery({
    queryKey: ['channel-schedule', id, view, anchorDay],
    queryFn: () => api.getSchedule(channelId, from.toISOString(), to.toISOString()),
    enabled: !Number.isNaN(channelId),
  });

  // Switch channel mode from Loop to Scheduled
  const switchModeMutation = useMutation({
    mutationFn: () =>
      api.updateChannel(channelId, {
        number: channel?.number ?? 1,
        name: channel?.name ?? '',
        mode: 'scheduled',
      }),
    onSuccess: () => {
      toast.success(t('channel_updated'));
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
      queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal mengubah mode');
    },
  });

  // Create slot mutation
  const createSlotMutation = useMutation({
    mutationFn: (data: SlotInput) => api.createSlot(channelId, data),
    onSuccess: () => {
      toast.success(t('slot_created'));
      queryClient.invalidateQueries({ queryKey: ['channel-schedule', id] });
      queryClient.invalidateQueries({ queryKey: ['channel-epg', id] });
    },
  });

  // Update slot mutation
  const updateSlotMutation = useMutation({
    mutationFn: ({ slotId, data }: { slotId: number; data: SlotInput }) =>
      api.updateSlot(channelId, slotId, data),
    onSuccess: () => {
      toast.success(t('slot_updated'));
      queryClient.invalidateQueries({ queryKey: ['channel-schedule', id] });
      queryClient.invalidateQueries({ queryKey: ['channel-epg', id] });
    },
  });

  // Delete slot mutation
  const deleteSlotMutation = useMutation({
    mutationFn: (slotId: number) => api.deleteSlot(channelId, slotId),
    onSuccess: () => {
      toast.success(t('slot_deleted'));
      queryClient.invalidateQueries({ queryKey: ['channel-schedule', id] });
      queryClient.invalidateQueries({ queryKey: ['channel-epg', id] });
    },
  });

  // Date step handlers
  const handlePrev = () => {
    const deltaDays = view === 'day' ? 1 : 7;
    setAnchorDate(new Date(anchorDate.getTime() - deltaDays * 86_400_000));
  };

  const handleNext = () => {
    const deltaDays = view === 'day' ? 1 : 7;
    setAnchorDate(new Date(anchorDate.getTime() + deltaDays * 86_400_000));
  };

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  // Open modal for creating slot
  const handleOpenCreate = (startISO?: string) => {
    setSlotToEdit(null);
    setInitialStartISO(startISO || null);
    setIsModalOpen(true);
  };

  // Open modal for editing slot
  const handleSelectOccurrence = (occ: ScheduleOccurrence) => {
    const slot = scheduleData?.slots.find((s) => s.id === occ.slot_id);
    if (slot) {
      setSlotToEdit(slot);
    } else {
      // Fallback synthetic slot from occurrence
      setSlotToEdit({
        id: occ.slot_id,
        channel_id: channelId,
        media_id: occ.media_id,
        filename: occ.filename,
        title: occ.title,
        start_at: occ.start_at,
        duration_sec: Math.round(
          (new Date(occ.end_at).getTime() - new Date(occ.start_at).getTime()) / 1000,
        ),
        media_duration_sec: occ.media_duration_sec,
        recurrence: occ.recurring ? 'daily' : 'none',
        until: null,
      });
    }
    setInitialStartISO(null);
    setIsModalOpen(true);
  };

  // Move occurrence on timeline (drag or keyboard)
  const handleMoveOccurrence = async (occ: ScheduleOccurrence, newStartISO: string) => {
    const slot = scheduleData?.slots.find((s) => s.id === occ.slot_id);
    const duration =
      slot?.duration_sec ??
      Math.round((new Date(occ.end_at).getTime() - new Date(occ.start_at).getTime()) / 1000);

    try {
      await updateSlotMutation.mutateAsync({
        slotId: occ.slot_id,
        data: {
          media_id: occ.media_id,
          start_at: newStartISO,
          duration_sec: duration,
          recurrence: slot?.recurrence || 'none',
          until: slot?.until || null,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      }
    }
  };

  // Save from Modal
  const handleModalSave = async (data: SlotInput) => {
    if (slotToEdit) {
      await updateSlotMutation.mutateAsync({ slotId: slotToEdit.id, data });
    } else {
      await createSlotMutation.mutateAsync(data);
    }
  };

  // Delete from Modal
  const handleModalDelete = async (slotId: number) => {
    await deleteSlotMutation.mutateAsync(slotId);
  };

  if (isChannelLoading) {
    return (
      <div className="flex min-h-[350px] items-center justify-center text-fg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (channelError || !channel) {
    return (
      <div className="rounded-tile border border-danger/30 bg-danger/10 p-6 text-center text-danger">
        <p className="text-sm">{channelError?.message || t('channel_not_found')}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refetchChannel()}
          className="mt-3"
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  const isLoopMode = channel.mode === 'loop';
  const hasNoSlots = (scheduleData?.slots?.length ?? 0) === 0;

  return (
    <div className="space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/channels')}
            aria-label={t('back_to_channels_list')}
            className="px-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <span className="timecode text-xs font-bold px-2 py-0.5 rounded-control bg-surface-2 border border-hairline text-accent">
                #{channel.number}
              </span>
              <h2 className="title text-xl font-bold tracking-tight text-fg truncate">
                {channel.name}
              </h2>
            </div>
            <p className="text-xs text-fg-muted mt-0.5">{t('schedule_subtitle')}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-control bg-surface-2 border border-hairline text-xs text-fg-subtle timecode"
            title="Server Timezone"
          >
            <Globe className="h-3.5 w-3.5 text-accent" />
            <span>{t('timezone_label', { tz: timezone })}</span>
          </span>

          <Button variant="primary" onClick={() => handleOpenCreate()} aria-label={t('add_slot')}>
            <Plus className="h-4 w-4 mr-1.5" />
            <span>{t('add_slot')}</span>
          </Button>
        </div>
      </div>

      {/* Loop Mode Warning Banner / Action */}
      {isLoopMode && (
        <Card className="border border-idle/40 bg-idle/10 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Radio className="h-5 w-5 text-idle shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-fg">{t('channel_is_in_loop_mode')}</h4>
                <p className="text-xs text-fg-muted mt-1 max-w-2xl">
                  {t('channel_is_in_loop_desc')}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => switchModeMutation.mutate()}
              disabled={switchModeMutation.isPending}
              className="shrink-0"
            >
              {switchModeMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('switching_mode')}</span>
                </span>
              ) : (
                t('switch_to_scheduled')
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Calendar Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-2/60 border border-hairline rounded-control p-2.5">
        <div className="flex items-center gap-2">
          {/* Day / Week SegmentedControl */}
          <SegmentedControl
            options={[
              { value: 'day', label: t('schedule_view_day') },
              { value: 'week', label: t('schedule_view_week') },
            ]}
            value={view}
            onChange={(v) => {
              setView(v as 'day' | 'week');
              setShowTimelineAnyway(true);
            }}
            ariaLabel="Tampilan Jadwal"
          />

          {/* Prev / Today / Next Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              aria-label={t('schedule_prev')}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToday}
              className="h-8 px-2.5 text-xs"
            >
              {t('schedule_today')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              aria-label={t('schedule_next')}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Range Label */}
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Calendar className="h-4 w-4 text-accent" />
          <span>{dateRangeLabel}</span>
        </div>
      </div>

      {/* Main Schedule Content */}
      {isScheduleLoading ? (
        <div className="flex min-h-[400px] items-center justify-center text-fg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : scheduleError ? (
        <div className="rounded-tile border border-danger/30 bg-danger/10 p-6 text-center text-danger">
          <p className="text-sm">{scheduleError.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => refetchSchedule()}
            className="mt-3"
          >
            {t('retry')}
          </Button>
        </div>
      ) : hasNoSlots && !showTimelineAnyway ? (
        <Card className="p-8">
          <EmptyState
            art={emptyPlaylistArt}
            title={t('no_schedule_slots')}
            description={t('no_schedule_slots_desc')}
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={() => handleOpenCreate()}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span>{t('add_slot')}</span>
                </Button>
                <Button variant="secondary" onClick={() => setShowTimelineAnyway(true)}>
                  <span>{t('schedule_title')}</span>
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="h-[650px]">
          <ScheduleTimeline
            occurrences={scheduleData?.occurrences || []}
            view={view}
            anchor={from}
            timezone={timezone}
            onCreate={handleOpenCreate}
            onSelect={handleSelectOccurrence}
            onMove={handleMoveOccurrence}
          />
        </div>
      )}

      {/* Slot Modal (Create / Edit / Delete) */}
      <SlotModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        channelId={channelId}
        slotToEdit={slotToEdit}
        initialStartISO={initialStartISO}
        timezone={timezone}
        onSave={handleModalSave}
        onDelete={handleModalDelete}
      />
    </div>
  );
}
