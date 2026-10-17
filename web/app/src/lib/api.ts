export interface Channel {
  id: number;
  number: number;
  name: string;
  created_at: string;
}

export interface MediaItem {
  media_id: number;
  filename: string;
  started_at: string;
  seek_sec: number;
  duration_sec: number;
  remaining_sec: number;
}

export interface EpgItem {
  media_id: number;
  title: string;
  start_at: string;
  end_at: string;
  duration_sec: number;
  is_current: boolean;
}

export interface EpgResponse {
  channel_id: number;
  generated_at: string;
  idle: boolean;
  items: EpgItem[];
}

export interface ChannelStatus {
  channel_id: number;
  state: string;
  item: MediaItem | null;
  skip_offset_sec: number;
}

export interface AuthMe {
  authenticated: boolean;
  csrf: string;
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
    try {
      const err = await response.json();
      if (err?.error) {
        message = err.error;
      }
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  getChannels: () => apiFetch<Channel[]>('/api/v1/channels'),
  getChannel: (id: number | string) => apiFetch<Channel>(`/api/v1/channels/${id}`),
  getChannelStatus: (id: number | string) =>
    apiFetch<ChannelStatus>(`/api/v1/channels/${id}/status`),
  getEpg: (id: number | string, count = 10) =>
    apiFetch<EpgResponse>(`/api/v1/channels/${id}/epg?count=${count}`),
  getAuthMe: async () => {
    const data = await apiFetch<AuthMe>('/api/v1/auth/me');
    if (data.csrf) {
      setCsrfToken(data.csrf);
    }
    return data;
  },
  fetch: apiFetch,
};
