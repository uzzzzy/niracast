/**
 * Timezone-aware date & time utilities for tv-stream schedule planner.
 * Uses native Intl.DateTimeFormat with IANA timezone strings without external date libraries.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: string; // 'Mon', 'Tue', ...
}

/**
 * Extracts year, month, day, hour, minute, second, and weekday in the target timezone.
 */
export function getZonedParts(dateOrIso: Date | string, timeZone: string): ZonedParts {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = p.value;
    }
  }
  const hourNum = Number.parseInt(map.hour, 10);
  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour: hourNum === 24 ? 0 : hourNum,
    minute: Number.parseInt(map.minute, 10),
    second: Number.parseInt(map.second, 10),
    weekday: map.weekday,
  };
}

/**
 * Converts a wall-clock date (YYYY-MM-DD) and time (HH:mm) in a target timezone into a UTC Date.
 */
export function wallClockToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split('-').map((v) => Number.parseInt(v, 10));
  const [hour, minute] = timeStr.split(':').map((v) => Number.parseInt(v, 10));

  // Target epoch milliseconds if this wall-clock time were UTC
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  let currentMs = targetUtcMs;
  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(currentMs), timeZone);
    const zonedAsUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const diff = targetUtcMs - zonedAsUtcMs;
    if (diff === 0) break;
    currentMs += diff;
  }
  return new Date(currentMs);
}

/**
 * Converts a UTC Date or ISO string into wall-clock date string (YYYY-MM-DD) and time string (HH:mm) in target timezone.
 */
export function utcToWallClock(
  dateOrIso: Date | string,
  timeZone: string,
): { dateStr: string; timeStr: string } {
  const parts = getZonedParts(dateOrIso, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    timeStr: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

/**
 * Returns the UTC Date corresponding to the start of the day (00:00:00) for the given instant in the given timezone.
 */
export function getStartOfDay(dateOrIso: Date | string, timeZone: string): Date {
  const { dateStr } = utcToWallClock(dateOrIso, timeZone);
  return wallClockToUtc(dateStr, '00:00', timeZone);
}

/**
 * Returns the UTC Date corresponding to the start of the week (Monday 00:00:00) containing the given instant in the given timezone.
 */
export function getWeekStartMonday(dateOrIso: Date | string, timeZone: string): Date {
  const parts = getZonedParts(dateOrIso, timeZone);
  const weekdayOffsetMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const daysSinceMonday = weekdayOffsetMap[parts.weekday] ?? 0;
  const currentStartOfDay = getStartOfDay(dateOrIso, timeZone);
  const roughMondayMs = currentStartOfDay.getTime() - daysSinceMonday * 86_400_000;
  return getStartOfDay(new Date(roughMondayMs), timeZone);
}

/**
 * Returns the number of minutes elapsed from the start of the day (00:00) in the given timezone.
 */
export function minutesFromDayStart(dateOrIso: Date | string, timeZone: string): number {
  const parts = getZonedParts(dateOrIso, timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

/**
 * Snaps minutes to the nearest 5-minute interval.
 */
export function snapTo5Min(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

/**
 * Formats an instant as HH:mm in the given timezone.
 */
export function formatTimeHHmm(dateOrIso: Date | string, timeZone: string): string {
  const parts = getZonedParts(dateOrIso, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Formats a duration in seconds into HH:MM:SS or MM:SS.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Friendly duration text (e.g. "1j 30m" or "45m").
 */
export function formatDurationFriendly(seconds: number, lang: 'id' | 'en' = 'id'): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const hUnit = lang === 'en' ? 'h' : 'j';
  const mUnit = 'm';
  const sUnit = 's';
  if (hrs > 0 && mins > 0) return `${hrs}${hUnit} ${mins}${mUnit}`;
  if (hrs > 0) return `${hrs}${hUnit}`;
  if (mins > 0) return `${mins}${mUnit}`;
  return `${secs}${sUnit}`;
}

/**
 * Computes overrun / short flags for a slot.
 */
export function computeSlotFlags(slotDurationSec: number, mediaDurationSec: number) {
  return {
    truncated: mediaDurationSec > slotDurationSec,
    short: mediaDurationSec < slotDurationSec,
  };
}

/**
 * Client-side overlap detection between candidate occurrence and list of occurrences.
 */
export function hasOverlap<T extends { start_at: string; end_at: string; slot_id?: number }>(
  candidate: { start_at: string; end_at: string; slot_id?: number },
  occurrences: T[],
  excludeSlotId?: number,
): { overlaps: boolean; conflictingWith?: T } {
  const candStart = new Date(candidate.start_at).getTime();
  const candEnd = new Date(candidate.end_at).getTime();

  for (const occ of occurrences) {
    if (excludeSlotId !== undefined && occ.slot_id === excludeSlotId) continue;
    const occStart = new Date(occ.start_at).getTime();
    const occEnd = new Date(occ.end_at).getTime();
    if (candStart < occEnd && candEnd > occStart) {
      return { overlaps: true, conflictingWith: occ };
    }
  }
  return { overlaps: false };
}
