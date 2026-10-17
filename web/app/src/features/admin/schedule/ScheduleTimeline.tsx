import { AlertTriangle, Repeat } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScheduleOccurrence } from '../../../lib/api';
import { useTranslation } from '../../../lib/i18n';
import {
  formatTimeHHmm,
  getStartOfDay,
  getWeekStartMonday,
  getZonedParts,
  minutesFromDayStart,
  snapTo5Min,
  utcToWallClock,
  wallClockToUtc,
} from './scheduleUtils';

export interface ScheduleTimelineProps {
  occurrences: ScheduleOccurrence[];
  view: 'day' | 'week';
  anchor: Date | string;
  timezone: string;
  now?: Date | string;
  onCreate: (startISO: string) => void;
  onSelect: (occurrence: ScheduleOccurrence) => void;
  onMove: (occurrence: ScheduleOccurrence, newStartISO: string) => void;
}

const HOUR_HEIGHT = 60; // 60px per hour => 1px = 1 minute
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT; // 1440px
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ScheduleTimeline({
  occurrences,
  view,
  anchor,
  timezone,
  now = new Date(),
  onCreate,
  onSelect,
  onMove,
}: ScheduleTimelineProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Drag state for pointer capture
  const [dragState, setDragState] = useState<{
    occ: ScheduleOccurrence;
    pointerId: number;
    startY: number;
    dragOffsetMin: number;
    hasMoved: boolean;
  } | null>(null);

  // Keyboard navigation offset per slot_id
  const [keyOffsets, setKeyOffsets] = useState<Record<number, number>>({});

  // Compute visible day columns based on view and anchor
  const dayColumns = useMemo(() => {
    if (view === 'day') {
      return [getStartOfDay(anchor, timezone)];
    }
    const monday = getWeekStartMonday(anchor, timezone);
    return Array.from({ length: 7 }, (_, i) => {
      // Add i days
      const roughDayMs = monday.getTime() + i * 86_400_000;
      return getStartOfDay(new Date(roughDayMs), timezone);
    });
  }, [view, anchor, timezone]);

  // Current wall-clock now position (if today is in visible columns)
  const nowDateParts = useMemo(() => getZonedParts(now, timezone), [now, timezone]);
  const nowMinute = useMemo(() => minutesFromDayStart(now, timezone), [now, timezone]);

  // On first mount scroll to two hours before "now" so the live position is in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial position only
  useEffect(() => {
    if (scrollContainerRef.current) {
      const target = Number.isFinite(nowMinute) ? nowMinute - 2 * HOUR_HEIGHT : 7 * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = Math.max(0, target);
    }
  }, []);

  // Format header dates
  const formatColumnHeader = useCallback(
    (colDate: Date) => {
      const parts = getZonedParts(colDate, timezone);
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'Mei',
        'Jun',
        'Jul',
        'Agu',
        'Sep',
        'Okt',
        'Nov',
        'Des',
      ];
      // Weekday index: Sun=0 ... Sat=6
      const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
      const wDay = dayNames[d.getUTCDay()];
      const mName = monthNames[parts.month - 1];
      return {
        weekday: wDay,
        label: `${parts.day} ${mName}`,
        isToday:
          parts.year === nowDateParts.year &&
          parts.month === nowDateParts.month &&
          parts.day === nowDateParts.day,
      };
    },
    [timezone, nowDateParts],
  );

  // Column click handler (click on empty grid -> onCreate)
  const handleColumnClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, colDate: Date) => {
      // Ignore clicks that bubbled from a slot block or child button
      if ((e.target as HTMLElement).closest('[data-slot-block]')) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const snappedMin = Math.max(0, Math.min(1435, snapTo5Min(clickY)));

      const hour = Math.floor(snappedMin / 60);
      const min = snappedMin % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${pad(hour)}:${pad(min)}`;

      const { dateStr } = utcToWallClock(colDate, timezone);
      const startUtc = wallClockToUtc(dateStr, timeStr, timezone);
      onCreate(startUtc.toISOString());
    },
    [timezone, onCreate],
  );

  // Pointer drag events on slot block
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, occ: ScheduleOccurrence) => {
    // Only primary mouse button or touch
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture errors in environments like jsdom
      }
    }

    setDragState({
      occ,
      pointerId: e.pointerId,
      startY: e.clientY,
      dragOffsetMin: 0,
      hasMoved: false,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;

    const deltaY = e.clientY - dragState.startY;
    const snappedDeltaMin = snapTo5Min(deltaY);

    if (snappedDeltaMin !== dragState.dragOffsetMin) {
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              dragOffsetMin: snappedDeltaMin,
              hasMoved: true,
            }
          : null,
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;

    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture was already released
      }
    }

    const { occ, dragOffsetMin, hasMoved } = dragState;
    setDragState(null);

    if (!hasMoved || dragOffsetMin === 0) {
      onSelect(occ);
      return;
    }

    // Commit drag move
    const currentStartMs = new Date(occ.start_at).getTime();
    const newStartMs = currentStartMs + dragOffsetMin * 60 * 1000;
    onMove(occ, new Date(newStartMs).toISOString());
  };

  // Keyboard navigation on slot block
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, occ: ScheduleOccurrence) => {
    const delta = e.shiftKey ? 60 : 5;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      setKeyOffsets((prev) => ({
        ...prev,
        [occ.slot_id]: (prev[occ.slot_id] || 0) + dir * delta,
      }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const offset = keyOffsets[occ.slot_id];
      if (offset && offset !== 0) {
        const currentStartMs = new Date(occ.start_at).getTime();
        const newStartMs = currentStartMs + offset * 60 * 1000;
        setKeyOffsets((prev) => {
          const next = { ...prev };
          delete next[occ.slot_id];
          return next;
        });
        onMove(occ, new Date(newStartMs).toISOString());
      } else {
        onSelect(occ);
      }
    } else if (e.key === 'Escape') {
      setKeyOffsets((prev) => {
        const next = { ...prev };
        delete next[occ.slot_id];
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full rounded-card border border-hairline bg-surface-1 overflow-hidden shadow-sm">
      {/* UI Hint Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-2/60 border-b border-hairline text-xs text-fg-subtle">
        <div className="flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5 text-accent shrink-0" />
          <span>{t('slot_move_recurring_hint')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-onair inline-block" />
            <span>{t('live')}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-idle inline-block" />
            <span>{t('idle')}</span>
          </span>
        </div>
      </div>

      {/* Main Timeline Body */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-auto relative outline-none"
      >
        <div className="min-w-fit flex flex-col">
          {/* Header Row: Column Days */}
          <div className="sticky top-0 z-30 flex border-b border-hairline bg-surface-2 text-xs">
            {/* Hour labels spacer */}
            <div className="w-14 sm:w-16 shrink-0 border-r border-hairline bg-surface-2/80 p-2 text-center text-[11px] font-semibold text-fg-subtle timecode">
              24H
            </div>

            {/* Day columns headers */}
            {dayColumns.map((colDate) => {
              const header = formatColumnHeader(colDate);
              return (
                <div
                  key={colDate.toISOString()}
                  className={`flex-1 min-w-[150px] sm:min-w-[180px] p-2.5 text-center border-r border-hairline last:border-r-0 ${
                    header.isToday ? 'bg-accent/10 font-bold' : ''
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
                    {header.weekday}
                  </div>
                  <div
                    className={`text-sm mt-0.5 ${
                      header.isToday ? 'text-accent font-bold' : 'text-fg font-medium'
                    }`}
                  >
                    {header.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grid Area */}
          <div className="flex relative" style={{ height: `${TOTAL_HEIGHT}px` }}>
            {/* Time Axis Labels */}
            <div className="w-14 sm:w-16 shrink-0 border-r border-hairline bg-surface-1 select-none">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="relative border-b border-hairline/40 pr-2 pt-1 text-right timecode text-[11px] text-fg-subtle"
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {dayColumns.map((colDate) => {
              const header = formatColumnHeader(colDate);
              const colStartMs = colDate.getTime();
              // Column end is 24 hours later (start of next day)
              const colEndDate = getStartOfDay(new Date(colStartMs + 28 * 3600 * 1000), timezone);
              const colEndMs = colEndDate.getTime();

              // Visible occurrences in this column (supports splitting across midnight)
              const columnOccurrences = occurrences.filter((occ) => {
                const s = new Date(occ.start_at).getTime();
                const e = new Date(occ.end_at).getTime();
                return s < colEndMs && e > colStartMs;
              });

              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: Column background click adds slot at snapped time
                // biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard slot creation is handled via Add Slot button
                <div
                  key={colDate.toISOString()}
                  onClick={(e) => handleColumnClick(e, colDate)}
                  className="flex-1 min-w-[150px] sm:min-w-[180px] border-r border-hairline last:border-r-0 relative cursor-pointer"
                  style={{
                    height: `${TOTAL_HEIGHT}px`,
                    background:
                      'repeating-linear-gradient(45deg, transparent, transparent 10px, color-mix(in srgb, var(--hairline) 30%, transparent) 10px, color-mix(in srgb, var(--hairline) 30%, transparent) 20px)',
                  }}
                  title={t('no_schedule_slots_desc')}
                >
                  {/* Subtle Slate Background Watermark */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-20 text-fg-subtle font-semibold text-xs uppercase tracking-widest">
                    {t('slate_filler_label')}
                  </div>

                  {/* Horizontal Hour Divider Lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{ top: `${hour * HOUR_HEIGHT}px` }}
                      className="absolute left-0 right-0 border-b border-hairline/35 pointer-events-none"
                    />
                  ))}

                  {/* "Now" Line indicator */}
                  {header.isToday && nowMinute >= 0 && nowMinute <= 1440 && (
                    <div
                      style={{ top: `${nowMinute}px` }}
                      className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                    >
                      <div className="h-2 w-2 rounded-full bg-onair -ml-1 shadow-sm" />
                      <div className="h-[2px] w-full bg-onair shadow-sm" />
                    </div>
                  )}

                  {/* Slot Blocks */}
                  {columnOccurrences.map((occ) => {
                    const occStartMs = new Date(occ.start_at).getTime();
                    const occEndMs = new Date(occ.end_at).getTime();

                    // Clip to current day boundaries
                    const segStartMs = Math.max(occStartMs, colStartMs);
                    const segEndMs = Math.min(occEndMs, colEndMs);

                    const segStartMin = (segStartMs - colStartMs) / 60000;
                    const segEndMin = (segEndMs - colStartMs) / 60000;

                    const isBeingDragged =
                      dragState?.occ.slot_id === occ.slot_id &&
                      dragState.occ.start_at === occ.start_at;

                    const effectiveOffset = isBeingDragged
                      ? dragState.dragOffsetMin
                      : keyOffsets[occ.slot_id] || 0;

                    const top = segStartMin + effectiveOffset;
                    const height = Math.max(26, segEndMin - segStartMin);

                    const timeLabel = `${formatTimeHHmm(occ.start_at, timezone)}–${formatTimeHHmm(
                      occ.end_at,
                      timezone,
                    )}`;

                    return (
                      // biome-ignore lint/a11y/useSemanticElements: Complex interactive slot block with drag handles and sub-elements
                      <div
                        key={`${occ.slot_id}-${occ.start_at}`}
                        data-slot-block
                        tabIndex={0}
                        role="button"
                        aria-label={`${occ.title} ${timeLabel}`}
                        onPointerDown={(e) => handlePointerDown(e, occ)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onKeyDown={(e) => handleKeyDown(e, occ)}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          zIndex: isBeingDragged || effectiveOffset !== 0 ? 40 : 10,
                        }}
                        className={`absolute left-1 right-1 rounded-control border p-1.5 text-xs select-none transition-shadow focus:outline-none focus:ring-2 focus:ring-accent flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing ${
                          isBeingDragged
                            ? 'bg-surface-3 border-accent shadow-lg opacity-90'
                            : effectiveOffset !== 0
                              ? 'bg-surface-3 border-accent ring-1 ring-accent'
                              : 'bg-surface-2 border-hairline-strong hover:bg-surface-3 shadow-sm'
                        }`}
                      >
                        {/* Title and Recurrence Icon */}
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span
                            className="font-semibold text-fg truncate text-[11px] leading-tight"
                            title={occ.title}
                          >
                            {occ.title}
                          </span>
                          {occ.recurring && (
                            <Repeat
                              className="h-3 w-3 text-accent shrink-0"
                              aria-label="Recurring"
                            />
                          )}
                        </div>

                        {/* Time & Warning Chips */}
                        <div className="flex items-center justify-between gap-1 mt-auto pt-0.5">
                          <span className="timecode text-[10px] text-fg-subtle truncate">
                            {timeLabel}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            {occ.truncated && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-semibold bg-idle/15 text-idle border border-idle/30"
                                title={t('slot_truncated_warning')}
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                <span>{t('chip_truncated')}</span>
                              </span>
                            )}
                            {occ.short && (
                              <span
                                className="inline-flex items-center rounded px-1 py-0.2 text-[9px] font-semibold bg-surface-3 text-fg-subtle border border-hairline"
                                title={t('slot_short_hint')}
                              >
                                {t('chip_short')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
