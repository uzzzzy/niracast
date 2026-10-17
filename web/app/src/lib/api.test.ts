import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiFetch, setCsrfToken } from './api';

describe('api fetch wrapper', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setCsrfToken('');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('attaches CSRF header on POST once known', async () => {
    setCsrfToken('test-csrf-token-123');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    globalThis.fetch = mockFetch;

    await apiFetch('/api/v1/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'News Channel', number: 1 }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/v1/channels');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');

    const headers = new Headers(init.headers);
    expect(headers.get('X-CSRF-Token')).toBe('test-csrf-token-123');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not attach CSRF header on GET requests', async () => {
    setCsrfToken('test-csrf-token-123');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: 'Main', number: 1, created_at: '2026-01-01' }],
    });
    globalThis.fetch = mockFetch;

    await api.getChannels();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('X-CSRF-Token')).toBeNull();
  });

  it('stores csrf token when calling getAuthMe', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, csrf: 'received-csrf-xyz' }),
    });
    globalThis.fetch = mockFetch;

    const res = await api.getAuthMe();
    expect(res.authenticated).toBe(true);
    expect(res.csrf).toBe('received-csrf-xyz');

    // Next POST should now automatically include this CSRF token
    await apiFetch('/api/v1/channels/1/skip', { method: 'POST' });
    const [, init] = mockFetch.mock.calls[1];
    const headers = new Headers(init.headers);
    expect(headers.get('X-CSRF-Token')).toBe('received-csrf-xyz');
  });
});
