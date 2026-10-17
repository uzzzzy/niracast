import { describe, expect, it } from 'vitest';
import {
  addToPlaylist,
  calculateTotalDuration,
  formatDuration,
  parseUptime,
  removeFromPlaylist,
  reorderPlaylist,
} from './playlist';

describe('playlist utils', () => {
  it('reorders playlist items correctly', () => {
    const list = ['A', 'B', 'C', 'D'];
    // Move 'A' (index 0) to index 2: should become B, C, A, D
    expect(reorderPlaylist(list, 0, 2)).toEqual(['B', 'C', 'A', 'D']);
    // Move 'D' (index 3) to index 0: should become D, A, B, C
    expect(reorderPlaylist(list, 3, 0)).toEqual(['D', 'A', 'B', 'C']);
    // Out of bounds or same index returns a shallow clone unchanged
    expect(reorderPlaylist(list, 1, 1)).toEqual(list);
    expect(reorderPlaylist(list, -1, 2)).toEqual(list);
    expect(reorderPlaylist(list, 0, 99)).toEqual(list);
  });

  it('adds item to playlist', () => {
    const list = [{ id: 1 }, { id: 2 }];
    const next = addToPlaylist(list, { id: 3 });
    expect(next).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(list).toHaveLength(2); // Immutability
  });

  it('removes item from playlist at index', () => {
    const list = ['item1', 'item2', 'item3'];
    expect(removeFromPlaylist(list, 1)).toEqual(['item1', 'item3']);
    expect(removeFromPlaylist(list, -1)).toEqual(list);
    expect(removeFromPlaylist(list, 10)).toEqual(list);
    expect(list).toHaveLength(3); // Immutability
  });

  it('calculates total duration across items', () => {
    const items = [{ duration_sec: 120 }, { duration_sec: 300 }, { duration_sec: 45 }];
    expect(calculateTotalDuration(items)).toBe(465);
    expect(calculateTotalDuration([])).toBe(0);
  });

  it('formats duration into MM:SS and HH:MM:SS', () => {
    expect(formatDuration(45)).toBe('00:45');
    expect(formatDuration(125)).toBe('02:05');
    expect(formatDuration(3665)).toBe('01:01:05');
    expect(formatDuration(45, true)).toBe('00:00:45');
    expect(formatDuration(0)).toBe('00:00');
  });

  it('parses uptime into days, hours, minutes, and seconds', () => {
    expect(parseUptime(0)).toEqual({ days: 0, hours: 0, mins: 0, secs: 0 });
    // 1 day (86400) + 2 hours (7200) + 3 mins (180) + 4 secs = 93784
    expect(parseUptime(93784)).toEqual({ days: 1, hours: 2, mins: 3, secs: 4 });
  });
});
