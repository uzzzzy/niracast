export interface PlaylistItemLike {
  media_id: number;
  duration_sec: number;
  filename?: string;
  [key: string]: unknown;
}

/**
 * Reorders an array by moving the item at startIndex to endIndex.
 * Returns a new array without mutating the input.
 */
export function reorderPlaylist<T>(items: T[], startIndex: number, endIndex: number): T[] {
  if (
    startIndex < 0 ||
    startIndex >= items.length ||
    endIndex < 0 ||
    endIndex >= items.length ||
    startIndex === endIndex
  ) {
    return [...items];
  }

  const result = [...items];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

/**
 * Appends a new item to the playlist.
 * Returns a new array without mutating the input.
 */
export function addToPlaylist<T>(items: T[], newItem: T): T[] {
  return [...items, newItem];
}

/**
 * Removes an item at the specified index from the playlist.
 * Returns a new array without mutating the input.
 */
export function removeFromPlaylist<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length) {
    return [...items];
  }
  const result = [...items];
  result.splice(index, 1);
  return result;
}

/**
 * Computes the total duration in seconds of all items in the playlist.
 */
export function calculateTotalDuration(items: { duration_sec: number }[]): number {
  return items.reduce((acc, item) => acc + (Math.max(0, item.duration_sec) || 0), 0);
}

/**
 * Formats a duration in seconds into MM:SS or HH:MM:SS.
 * If forceHours is true or seconds >= 3600, returns HH:MM:SS.
 */
export function formatDuration(seconds: number, forceHours = false): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0 || forceHours) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Deconstructs seconds into days, hours, minutes, and seconds.
 */
export function parseUptime(totalSeconds: number): {
  days: number;
  hours: number;
  mins: number;
  secs: number;
} {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return { days, hours, mins, secs };
}
