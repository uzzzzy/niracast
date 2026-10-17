import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, notifyUnauthorized } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import AdminPage from '../../../pages/AdminPage';
import { MockEventSource } from '../../../test/mockEventSource';
import { LoginCard } from './LoginCard';

describe('Admin Auth Flow', () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    vi.restoreAllMocks();
  });

  it('handles successful login flow', async () => {
    const loginSpy = vi.spyOn(api, 'login').mockResolvedValue({ csrf: 'mock-csrf' });
    const onSuccess = vi.fn();

    render(<LoginCard onSuccess={onSuccess} />);

    const passwordInput = screen.getByPlaceholderText(/password/i);
    fireEvent.change(passwordInput, { target: { value: 'correct-secret' } });

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('correct-secret');
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('handles wrong password error display', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new ApiError('Invalid password', 401));
    const onSuccess = vi.fn();

    render(<LoginCard onSuccess={onSuccess} />);

    const passwordInput = screen.getByPlaceholderText(/password/i);
    fireEvent.change(passwordInput, { target: { value: 'wrong-pass' } });

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/invalid password/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('handles 429 rate limit with friendly retry-after message', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new ApiError('Too many requests', 429, 45));
    const onSuccess = vi.fn();

    render(<LoginCard onSuccess={onSuccess} />);

    const passwordInput = screen.getByPlaceholderText(/password/i);
    fireEvent.change(passwordInput, { target: { value: 'brute-force' } });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/too many attempts.*45/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('returns to login card on 401 without losing route', async () => {
    vi.spyOn(api, 'getAuthMe').mockResolvedValue({
      authenticated: true,
      csrf: 'token-abc',
    });
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Channel 1', mode: 'loop', created_at: '2026-01-01' },
    ]);
    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      uptime_sec: 100,
      media_count: 5,
      channel_count: 1,
      running_channels: 0,
      ffmpeg: { path: '/bin/ffmpeg', version: '6.1' },
      idle_clip: { ready: true, size_bytes: 1000, modified_at: '2026-01-01' },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/channels']}>
          <Routes>
            <Route path="/admin/*" element={<AdminPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial load: authenticated shell is shown
    expect(await screen.findByText('Channel Management')).toBeInTheDocument();

    // Trigger 401 session expiry notification
    notifyUnauthorized();

    // Verifies it returns to Login card with session expired banner
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
  });
});
