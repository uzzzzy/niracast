import { describe, expect, it } from 'vitest';
import {
  computeSlotFlags,
  formatDuration,
  formatDurationFriendly,
  formatTimeHHmm,
  getStartOfDay,
  getWeekStartMonday,
  getZonedParts,
  hasOverlap,
  minutesFromDayStart,
  snapTo5Min,
  utcToWallClock,
  wallClockToUtc,
} from './scheduleUtils';

describe('scheduleUtils', () => {
  describe('timezone conversions with Asia/Jakarta (UTC+7, no DST)', () => {
    const tz = 'Asia/Jakarta';

    it('extracts zoned parts accurately', () => {
      // 2026-10-17 14:30:00 Jakarta is 2026-10-17 07:30:00 UTC
      const utcIso = '2026-10-17T07:30:00.000Z';
      const parts = getZonedParts(utcIso, tz);
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(10);
      expect(parts.day).toBe(17);
      expect(parts.hour).toBe(14);
      expect(parts.minute).toBe(30);
      expect(parts.second).toBe(0);
      expect(parts.weekday).toBe('Sat');
    });

    it('converts wall clock to UTC and back', () => {
      const utcDate = wallClockToUtc('2026-10-17', '14:35', tz);
      expect(utcDate.toISOString()).toBe('2026-10-17T07:35:00.000Z');

      const wallClock = utcToWallClock(utcDate, tz);
      expect(wallClock.dateStr).toBe('2026-10-17');
      expect(wallClock.timeStr).toBe('14:35');
    });

    it('gets start of day instant', () => {
      const startOfDay = getStartOfDay('2026-10-17T12:00:00.000Z', tz);
      // In Jakarta, 2026-10-17 00:00 is 2026-10-16 17:00:00 UTC
      expect(startOfDay.toISOString()).toBe('2026-10-16T17:00:00.000Z');

      const check = utcToWallClock(startOfDay, tz);
      expect(check.dateStr).toBe('2026-10-17');
      expect(check.timeStr).toBe('00:00');
    });

    it('gets week start Monday', () => {
      // 2026-10-17 is Saturday. Monday of this week is 2026-10-12
      const weekStart = getWeekStartMonday('2026-10-17T07:30:00.000Z', tz);
      const check = utcToWallClock(weekStart, tz);
      expect(check.dateStr).toBe('2026-10-12');
      expect(check.timeStr).toBe('00:00');
    });

    it('calculates minutesFromDayStart and formats HH:mm', () => {
      const utcIso = '2026-10-17T07:30:00.000Z'; // 14:30 Jakarta
      expect(minutesFromDayStart(utcIso, tz)).toBe(14 * 60 + 30);
      expect(formatTimeHHmm(utcIso, tz)).toBe('14:30');
    });
  });

  describe('timezone conversions with America/New_York (EDT UTC-4 / EST UTC-5)', () => {
    const tz = 'America/New_York';

    it('extracts zoned parts in EDT (October is EDT)', () => {
      // 2026-10-17 14:30 EDT is 2026-10-17 18:30 UTC
      const utcIso = '2026-10-17T18:30:00.000Z';
      const parts = getZonedParts(utcIso, tz);
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(10);
      expect(parts.day).toBe(17);
      expect(parts.hour).toBe(14);
      expect(parts.minute).toBe(30);
      expect(parts.weekday).toBe('Sat');
    });

    it('converts wall clock to UTC and back in New York', () => {
      const utcDate = wallClockToUtc('2026-10-17', '09:15', tz);
      expect(utcDate.toISOString()).toBe('2026-10-17T13:15:00.000Z');

      const wallClock = utcToWallClock(utcDate, tz);
      expect(wallClock.dateStr).toBe('2026-10-17');
      expect(wallClock.timeStr).toBe('09:15');
    });

    it('correctly handles winter EST (January, UTC-5)', () => {
      const utcDate = wallClockToUtc('2026-01-15', '09:00', tz);
      expect(utcDate.toISOString()).toBe('2026-01-15T14:00:00.000Z');

      const wallClock = utcToWallClock(utcDate, tz);
      expect(wallClock.dateStr).toBe('2026-01-15');
      expect(wallClock.timeStr).toBe('09:00');
    });
  });

  describe('snapping and formatting', () => {
    it('snaps minutes to 5 min', () => {
      expect(snapTo5Min(0)).toBe(0);
      expect(snapTo5Min(2)).toBe(0);
      expect(snapTo5Min(3)).toBe(5);
      expect(snapTo5Min(7)).toBe(5);
      expect(snapTo5Min(8)).toBe(10);
      expect(snapTo5Min(59)).toBe(60);
    });

    it('formats duration', () => {
      expect(formatDuration(45)).toBe('00:45');
      expect(formatDuration(125)).toBe('02:05');
      expect(formatDuration(3665)).toBe('01:01:05');
      expect(formatDurationFriendly(3600, 'id')).toBe('1j');
      expect(formatDurationFriendly(5400, 'id')).toBe('1j 30m');
      expect(formatDurationFriendly(5400, 'en')).toBe('1h 30m');
      expect(formatDurationFriendly(180, 'id')).toBe('3m');
    });
  });

  describe('slot flags and overlap detection', () => {
    it('computes overrun and short flags', () => {
      expect(computeSlotFlags(1800, 3600)).toEqual({ truncated: true, short: false });
      expect(computeSlotFlags(3600, 1800)).toEqual({ truncated: false, short: true });
      expect(computeSlotFlags(3600, 3600)).toEqual({ truncated: false, short: false });
    });

    it('detects client-side overlaps', () => {
      const existing = [
        {
          slot_id: 1,
          start_at: '2026-10-17T10:00:00Z',
          end_at: '2026-10-17T11:00:00Z',
        },
        {
          slot_id: 2,
          start_at: '2026-10-17T14:00:00Z',
          end_at: '2026-10-17T15:00:00Z',
        },
      ];

      // Disjoint before
      expect(
        hasOverlap({ start_at: '2026-10-17T09:00:00Z', end_at: '2026-10-17T10:00:00Z' }, existing),
      ).toEqual({ overlaps: false });

      // Overlapping first
      const overlap1 = hasOverlap(
        { start_at: '2026-10-17T10:30:00Z', end_at: '2026-10-17T11:30:00Z' },
        existing,
      );
      expect(overlap1.overlaps).toBe(true);
      expect(overlap1.conflictingWith?.slot_id).toBe(1);

      // Overlapping second
      const overlap2 = hasOverlap(
        { start_at: '2026-10-17T13:30:00Z', end_at: '2026-10-17T14:30:00Z' },
        existing,
      );
      expect(overlap2.overlaps).toBe(true);
      expect(overlap2.conflictingWith?.slot_id).toBe(2);

      // Exclude same slot when editing
      const editSelf = hasOverlap(
        { slot_id: 2, start_at: '2026-10-17T14:00:00Z', end_at: '2026-10-17T15:00:00Z' },
        existing,
        2,
      );
      expect(editSelf.overlaps).toBe(false);
    });
  });
});
