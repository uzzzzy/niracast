import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Info, Loader2, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, SegmentedControl, Select } from '../../../components/ui';
import { ApiError, api, type ScheduleSlot, type SlotInput } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import { formatDuration, formatTimeHHmm, utcToWallClock, wallClockToUtc } from './scheduleUtils';

export interface SlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: number;
  slotToEdit?: ScheduleSlot | null;
  initialStartISO?: string | null;
  timezone: string;
  onSave: (data: SlotInput) => Promise<void>;
  onDelete?: (slotId: number) => Promise<void>;
}

export function SlotModal({
  isOpen,
  onClose,
  channelId: _channelId,
  slotToEdit,
  initialStartISO,
  timezone,
  onSave,
  onDelete,
}: SlotModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Load media files for selection
  const { data: mediaFiles, isLoading: isMediaLoading } = useQuery({
    queryKey: ['admin-media'],
    queryFn: api.getMedia,
    enabled: isOpen,
  });

  const [mediaIdVal, setMediaIdVal] = useState<string>('');
  const [dateVal, setDateVal] = useState<string>('');
  const [timeVal, setTimeVal] = useState<string>('');
  const [durationSecVal, setDurationSecVal] = useState<string>('');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>('none');
  const [untilVal, setUntilVal] = useState<string>('');

  const [mediaSearch, setMediaSearch] = useState<string>('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state when modal opens or target slot changes
  useEffect(() => {
    if (!isOpen) return;

    setInlineError(null);
    setMediaSearch('');

    if (slotToEdit) {
      setMediaIdVal(String(slotToEdit.media_id));
      const { dateStr, timeStr } = utcToWallClock(slotToEdit.start_at, timezone);
      setDateVal(dateStr);
      setTimeVal(timeStr);
      setDurationSecVal(String(slotToEdit.duration_sec));
      setRecurrence(slotToEdit.recurrence || 'none');
      if (slotToEdit.until) {
        const u = utcToWallClock(slotToEdit.until, timezone);
        setUntilVal(u.dateStr);
      } else {
        setUntilVal('');
      }
    } else if (initialStartISO) {
      setMediaIdVal('');
      const { dateStr, timeStr } = utcToWallClock(initialStartISO, timezone);
      setDateVal(dateStr);
      setTimeVal(timeStr);
      setDurationSecVal('');
      setRecurrence('none');
      setUntilVal('');
    } else {
      setMediaIdVal('');
      const nowClock = utcToWallClock(new Date(), timezone);
      setDateVal(nowClock.dateStr);
      setTimeVal(nowClock.timeStr);
      setDurationSecVal('');
      setRecurrence('none');
      setUntilVal('');
    }
  }, [isOpen, slotToEdit, initialStartISO, timezone]);

  // Handle dialog opening / closing via native dialog API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Selected media object
  const selectedMedia = mediaFiles?.find((m) => m.id === Number(mediaIdVal));

  // Auto-populate duration if media is chosen but duration not set yet
  useEffect(() => {
    if (mediaIdVal && (!durationSecVal || durationSecVal === '0')) {
      const m = mediaFiles?.find((item) => item.id === Number(mediaIdVal));
      if (m) {
        setDurationSecVal(String(m.duration_sec));
      }
    }
  }, [mediaFiles, mediaIdVal, durationSecVal]);

  // When media changes, default slot duration to media duration if not set
  const handleMediaChange = (newMediaId: string) => {
    setMediaIdVal(newMediaId);
    const m = mediaFiles?.find((item) => item.id === Number(newMediaId));
    if (m && (!durationSecVal || durationSecVal === '0' || !slotToEdit)) {
      setDurationSecVal(String(m.duration_sec));
    }
  };

  // Filter media files by search term
  const filteredMedia = mediaFiles?.filter((m) =>
    mediaSearch ? m.filename.toLowerCase().includes(mediaSearch.toLowerCase()) : true,
  );

  // Media durations are fractional (e.g. 9291.04 s); a 0.5 s tolerance keeps the default
  // slot length from being flagged as cut or short.
  const slotDurationNum = Number.parseFloat(durationSecVal) || 0;
  const isCut =
    selectedMedia && slotDurationNum > 0 && slotDurationNum < selectedMedia.duration_sec - 0.5;
  const isShort =
    selectedMedia && slotDurationNum > 0 && slotDurationNum > selectedMedia.duration_sec + 0.5;

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);

    const mediaIdNum = Number.parseInt(mediaIdVal, 10);
    if (Number.isNaN(mediaIdNum) || mediaIdNum <= 0) {
      setInlineError('Pilih berkas media untuk slot ini.');
      return;
    }

    if (!dateVal || !timeVal) {
      setInlineError('Tanggal dan waktu mulai harus diisi.');
      return;
    }

    if (slotDurationNum <= 0 || slotDurationNum > 86400) {
      setInlineError('Durasi slot harus antara 1 sampai 86400 detik (24 jam).');
      return;
    }

    setIsSubmitting(true);
    try {
      const startUtc = wallClockToUtc(dateVal, timeVal, timezone);
      let untilUtc: string | null = null;
      if (recurrence !== 'none' && untilVal) {
        untilUtc = wallClockToUtc(untilVal, '23:59', timezone).toISOString();
      }

      const input: SlotInput = {
        media_id: mediaIdNum,
        start_at: startUtc.toISOString(),
        duration_sec: slotDurationNum,
        recurrence,
        until: untilUtc,
      };

      await onSave(input);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const conflict = (
          err.body as
            | { conflict?: { slot_id: number; title: string; start_at: string; end_at: string } }
            | undefined
        )?.conflict;
        if (conflict) {
          const s = formatTimeHHmm(conflict.start_at, timezone);
          const eTime = formatTimeHHmm(conflict.end_at, timezone);
          setInlineError(
            t('slot_conflict_error', {
              title: conflict.title || `Slot #${conflict.slot_id}`,
              time: `${s}–${eTime}`,
            }),
          );
        } else {
          setInlineError(err.message || 'Jadwal bertabrakan dengan siaran lain');
        }
      } else if (err instanceof Error) {
        setInlineError(err.message);
      } else {
        setInlineError('Terjadi kesalahan yang tidak diketahui.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!slotToEdit || !onDelete) return;

    if (!window.confirm(t('delete_slot_confirm'))) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(slotToEdit.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setInlineError(err.message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-full max-w-lg glass-thick rounded-sheet p-6 shadow-[var(--shadow-2)] text-fg backdrop:bg-black/50 focus:outline-none max-h-[90vh] overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-4 mb-5">
        <h3 className="title text-fg">{slotToEdit ? t('edit_slot') : t('add_slot')}</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Inline Error Alert */}
      {inlineError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-tile border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger" />
          <span>{inlineError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Media Select */}
        <Field label={t('slot_media')} htmlFor="slot-media">
          {mediaFiles && mediaFiles.length > 8 && (
            <div className="mb-2">
              <Input
                type="text"
                placeholder={t('search_media_placeholder')}
                value={mediaSearch}
                onChange={(e) => setMediaSearch(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}
          <Select
            id="slot-media"
            value={mediaIdVal}
            onChange={(e) => handleMediaChange(e.target.value)}
            disabled={isMediaLoading}
            required
          >
            <option value="">{t('slot_select_media')}</option>
            {filteredMedia?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.filename} ({formatDuration(m.duration_sec)})
              </option>
            ))}
          </Select>
        </Field>

        {/* Date and Start Time (in Server Timezone) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('slot_date')} htmlFor="slot-date">
            <Input
              id="slot-date"
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              required
            />
          </Field>

          <Field label={`${t('slot_start_time')} (${timezone})`} htmlFor="slot-time">
            <Input
              id="slot-time"
              type="time"
              step="60"
              value={timeVal}
              onChange={(e) => setTimeVal(e.target.value)}
              required
            />
          </Field>
        </div>

        {/* Slot Duration (defaults to media duration) */}
        <Field label={t('slot_duration')} htmlFor="slot-duration">
          <Input
            id="slot-duration"
            type="number"
            min="1"
            max="86400"
            step="any"
            value={durationSecVal}
            onChange={(e) => setDurationSecVal(e.target.value)}
            placeholder="3600"
            required
          />
        </Field>

        {/* Truncated / Short Warnings */}
        {isCut && (
          <div className="flex items-start gap-2 rounded-tile border border-idle/30 bg-idle/10 p-2.5 text-xs text-idle">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('slot_truncated_warning')}</span>
          </div>
        )}
        {isShort && (
          <div className="flex items-start gap-2 rounded-tile border border-hairline bg-surface-2 p-2.5 text-xs text-fg-subtle">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-accent" />
            <span>{t('slot_short_hint')}</span>
          </div>
        )}

        {/* Recurrence */}
        <Field label={t('slot_recurrence')}>
          <SegmentedControl
            options={[
              { value: 'none', label: t('recurrence_none') },
              { value: 'daily', label: t('recurrence_daily') },
              { value: 'weekly', label: t('recurrence_weekly') },
            ]}
            value={recurrence}
            onChange={(v) => setRecurrence(v as 'none' | 'daily' | 'weekly')}
            ariaLabel={t('slot_recurrence')}
          />
        </Field>

        {/* Repeat Until (optional when recurring) */}
        {recurrence !== 'none' && (
          <Field label={t('slot_until')} htmlFor="slot-until" hint="Opsional">
            <Input
              id="slot-until"
              type="date"
              value={untilVal}
              min={dateVal}
              onChange={(e) => setUntilVal(e.target.value)}
            />
          </Field>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-hairline">
          <div>
            {slotToEdit && onDelete && (
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
                aria-label={t('delete_slot')}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                <span>{t('delete_slot')}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting || isDeleting}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting || isDeleting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('save')}</span>
                </span>
              ) : (
                t('save')
              )}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
