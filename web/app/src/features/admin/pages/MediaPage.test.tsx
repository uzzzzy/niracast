import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { MediaPage } from './MediaPage';

describe('MediaPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MediaPage />
      </QueryClientProvider>,
    );

  it('handles media rescan with 1s interval polling until completion', async () => {
    vi.spyOn(api, 'getMedia').mockResolvedValue([
      {
        id: 1,
        path: '/media/video1.mp4',
        filename: 'video1.mp4',
        duration_sec: 120,
        codec_video: 'h264',
        codec_audio: 'aac',
        width: 1920,
        height: 1080,
      },
    ]);

    const rescanSpy = vi.spyOn(api, 'rescanMedia').mockResolvedValue({ status: 'started' });

    let pollCount = 0;
    const scanStatusSpy = vi.spyOn(api, 'getMediaScanStatus').mockImplementation(async () => {
      pollCount++;
      if (pollCount < 2) {
        return {
          running: true,
          last_started_at: '2026-01-01T00:00:00Z',
          last_finished_at: null,
          last_error: null,
        };
      }
      return {
        running: false,
        last_started_at: '2026-01-01T00:00:00Z',
        last_finished_at: '2026-01-01T00:00:05Z',
        last_error: null,
      };
    });

    renderComponent();

    expect(await screen.findByText('video1.mp4')).toBeInTheDocument();

    const rescanBtn = screen.getByRole('button', { name: /rescan/i });
    fireEvent.click(rescanBtn);

    expect(rescanSpy).toHaveBeenCalledTimes(1);

    // Advance 1 second -> first poll returns running: true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(scanStatusSpy).toHaveBeenCalledTimes(1);

    // Advance another second -> second poll returns running: false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(scanStatusSpy).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rescan/i })).not.toBeDisabled();
    });
  });

  it('displays last error when scan status completes with error', async () => {
    vi.spyOn(api, 'getMedia').mockResolvedValue([]);
    vi.spyOn(api, 'rescanMedia').mockResolvedValue({ status: 'started' });
    vi.spyOn(api, 'getMediaScanStatus').mockResolvedValue({
      running: false,
      last_started_at: '2026-01-01T00:00:00Z',
      last_finished_at: '2026-01-01T00:00:01Z',
      last_error: 'Disk I/O failure in /media',
    });

    renderComponent();

    const rescanBtn = await screen.findByRole('button', { name: /rescan/i });
    fireEvent.click(rescanBtn);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(await screen.findByText(/disk i\/o failure in \/media/i)).toBeInTheDocument();
  });
});
