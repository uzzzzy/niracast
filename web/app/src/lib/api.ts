export interface Channel {
  id: number;
  number: number;
  name: string;
  mode: 'loop' | 'scheduled';
  created_at: string;
}

export interface ScheduleSlot {
  id: number;
  channel_id: number;
  media_id: number;
  filename: string;
  title: string;
  start_at: string;
  duration_sec: number;
  media_duration_sec: number;
  recurrence: 'none' | 'daily' | 'weekly';
  until: string | null;
}

export interface ScheduleOccurrence {
  slot_id: number;
  media_id: number;
  filename: string;
  title: string;
  start_at: string;
  end_at: string;
  media_duration_sec: number;
  truncated: boolean;
  short: boolean;
  recurring: boolean;
}

export type Occurrence = ScheduleOccurrence;

export interface ScheduleResponse {
  channel_id: number;
  timezone: string;
  slots: ScheduleSlot[];
  occurrences: ScheduleOccurrence[];
}

export interface SlotInput {
  media_id: number;
  start_at: string;
  duration_sec?: number;
  recurrence?: 'none' | 'daily' | 'weekly';
  until?: string | null;
}

export interface ScheduleConflict {
  slot_id: number;
  title: string;
  start_at: string;
  end_at: string;
}

export interface ScheduleConflictErrorBody {
  error: 'schedule_conflict' | string;
  message: string;
  conflict?: ScheduleConflict;
}

export interface MediaItem {
  media_id: number;
  filename: string;
  started_at: string;
  seek_sec: number;
  duration_sec: number;
  remaining_sec: number;
}

export interface PlaylistItem {
  media_id: number;
  position: number;
  filename: string;
  duration_sec: number;
}

export interface PlaylistResponse {
  channel_id: number;
  items: PlaylistItem[];
  total_duration_sec: number;
}

export interface MediaFile {
  id: number;
  path: string;
  filename: string;
  duration_sec: number;
  codec_video: string;
  codec_audio: string;
  width: number;
  height: number;
}

export interface RescanResponse {
  status: 'started' | 'already_running';
}

export interface ScanStatus {
  running: boolean;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
}

export interface SystemInfo {
  uptime_sec: number;
  media_count: number;
  channel_count: number;
  running_channels: number;
  timezone?: string;
  ffmpeg: {
    path: string;
    version: string;
  };
  idle_clip: {
    ready: boolean;
    size_bytes: number;
    modified_at: string;
  };
}

export interface EpgItem {
  media_id: number;
  title: string;
  start_at: string;
  end_at: string;
  duration_sec: number;
  is_current: boolean;
  kind?: 'programme' | 'slate';
}

export interface EpgResponse {
  channel_id: number;
  generated_at: string;
  idle: boolean;
  items: EpgItem[];
}

export interface ChannelStatus {
  channel_id: number;
  state: 'stopped' | 'idle' | 'playing' | string;
  item: MediaItem | null;
  skip_offset_sec: number;
}

export interface AuthMe {
  authenticated: boolean;
  csrf: string;
}

export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  body?: unknown;

  constructor(message: string, status: number, retryAfter?: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

type UnauthorizedHandler = () => void;
const unauthorizedHandlers: Set<UnauthorizedHandler> = new Set();

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

export function notifyUnauthorized(): void {
  for (const handler of unauthorizedHandlers) {
    handler();
  }
}

let csrfToken = '';

export function getCsrfToken(): string {
  return csrfToken;
}

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(endpoint, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    let body: unknown;
    try {
      const err = await response.json();
      body = err;
      if (err?.message) {
        message = err.message;
      } else if (err?.error) {
        message = err.error;
      }
    } catch {
      // non-JSON error body
    }

    const retryHeader = response.headers.get('Retry-After');
    const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : undefined;

    if (response.status === 401) {
      notifyUnauthorized();
    }

    throw new ApiError(message, response.status, retryAfter, body);
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (typeof response.text === 'function') {
    const text = await response.text();
    if (!text) {
      return {} as T;
    }
    return JSON.parse(text) as T;
  }

  return response.json();
}

export const api = {
  login: async (password: string) => {
    const data = await apiFetch<{ csrf: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (data.csrf) {
      setCsrfToken(data.csrf);
    }
    return data;
  },
  logout: async () => {
    await apiFetch<{ success?: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
    });
    setCsrfToken('');
  },
  getAuthMe: async () => {
    const data = await apiFetch<AuthMe>('/api/v1/auth/me');
    if (data.csrf) {
      setCsrfToken(data.csrf);
    }
    return data;
  },
  getChannels: () => apiFetch<Channel[]>('/api/v1/channels'),
  getChannel: (id: number | string) => apiFetch<Channel>(`/api/v1/channels/${id}`),
  createChannel: (data: { number: number; name: string; mode?: 'loop' | 'scheduled' }) =>
    apiFetch<Channel>('/api/v1/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateChannel: (
    id: number | string,
    data: { number?: number; name?: string; mode?: 'loop' | 'scheduled' },
  ) =>
    apiFetch<Channel>(`/api/v1/channels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteChannel: (id: number | string) =>
    apiFetch<void>(`/api/v1/channels/${id}`, {
      method: 'DELETE',
    }),
  getSchedule: (id: number | string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return apiFetch<ScheduleResponse>(`/api/v1/channels/${id}/schedule${qs ? `?${qs}` : ''}`);
  },
  createSlot: (channelId: number | string, data: SlotInput) =>
    apiFetch<ScheduleSlot>(`/api/v1/channels/${channelId}/schedule/slots`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSlot: (channelId: number | string, slotId: number | string, data: SlotInput) =>
    apiFetch<ScheduleSlot>(`/api/v1/channels/${channelId}/schedule/slots/${slotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSlot: (channelId: number | string, slotId: number | string) =>
    apiFetch<void>(`/api/v1/channels/${channelId}/schedule/slots/${slotId}`, {
      method: 'DELETE',
    }),
  getChannelPlaylist: (id: number | string) =>
    apiFetch<PlaylistResponse>(`/api/v1/channels/${id}/playlist`),
  setChannelPlaylist: (id: number | string, media_ids: number[]) =>
    apiFetch<PlaylistResponse>(`/api/v1/channels/${id}/playlist`, {
      method: 'POST',
      body: JSON.stringify({ media_ids }),
    }),
  getMedia: () => apiFetch<MediaFile[]>('/api/v1/media'),
  rescanMedia: () =>
    apiFetch<RescanResponse>('/api/v1/media/rescan', {
      method: 'POST',
    }),
  getMediaScanStatus: () => apiFetch<ScanStatus>('/api/v1/media/scan-status'),
  getSystemInfo: () => apiFetch<SystemInfo>('/api/v1/system'),
  getChannelStatus: (id: number | string) =>
    apiFetch<ChannelStatus>(`/api/v1/channels/${id}/status`),
  skipChannel: (id: number | string) =>
    apiFetch<ChannelStatus>(`/api/v1/channels/${id}/skip`, {
      method: 'POST',
    }),
  getEpg: (id: number | string, count = 10) =>
    apiFetch<EpgResponse>(`/api/v1/channels/${id}/epg?count=${count}`),
  fetch: apiFetch,
};
