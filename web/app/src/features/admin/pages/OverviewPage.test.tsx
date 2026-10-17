import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { MockEventSource } from '../../../test/mockEventSource';
import { AdminEventsProvider } from '../hooks/useAdminEvents';
import { OverviewPage } from './OverviewPage';

describe('OverviewPage', () => {
  let queryClient: QueryClient;
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AdminEventsProvider>
          <OverviewPage />
        </AdminEventsProvider>
      </QueryClientProvider>,
    );

  it('merges channels list with SSE snapshot and dynamic playout events', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Main Channel', mode: 'loop', created_at: '2026-01-01' },
      { id: 2, number: 2, name: 'Backup Channel', mode: 'loop', created_at: '2026-01-01' },
    ]);

    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      uptime_sec: 7200,
      media_count: 10,
      channel_count: 2,
      running_channels: 1,
      ffmpeg: { path: '/bin/ffmpeg', version: '6.1' },
      idle_clip: { ready: true, size_bytes: 5000, modified_at: '2026-01-01' },
    });

    renderComponent();

    // Both channels initially rendered
    expect(await screen.findByText('Main Channel')).toBeInTheDocument();
    expect(screen.getByText('Backup Channel')).toBeInTheDocument();

    // Verify initial STOPPED badges
    const stoppedBadges = await screen.findAllByText('STOPPED');
    expect(stoppedBadges.length).toBeGreaterThanOrEqual(1);

    // Simulate SSE snapshot event
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    act(() => {
      es.emit('snapshot', [
        {
          channel_id: 1,
          state: 'playing',
          item: {
            media_id: 10,
            filename: 'news_bulletin.mp4',
            started_at: '2026-01-01T12:00:00Z',
            seek_sec: 15,
            duration_sec: 120,
            remaining_sec: 105,
          },
          skip_offset_sec: 0,
        },
      ]);
    });

    // Channel 1 updates to PLAYING with filename
    expect(await screen.findByText('PLAYING')).toBeInTheDocument();
    expect(screen.getByText('news_bulletin.mp4')).toBeInTheDocument();

    // Simulate SSE idle event for Channel 1
    act(() => {
      es.emit('channel.idle', {
        type: 'channel.idle',
        channel_id: 1,
        time: '2026-01-01T12:02:00Z',
      });
    });

    expect(await screen.findByText('IDLE')).toBeInTheDocument();
    expect(screen.getByText("We'll be right back")).toBeInTheDocument();
  });

  it('handles skip button click and handles 409 error gracefully', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Live 1', mode: 'loop', created_at: '2026-01-01' },
    ]);

    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      uptime_sec: 3600,
      media_count: 5,
      channel_count: 1,
      running_channels: 1,
      ffmpeg: { path: '/bin/ffmpeg', version: '6.1' },
      idle_clip: { ready: true, size_bytes: 5000, modified_at: '2026-01-01' },
    });

    const skipSpy = vi
      .spyOn(api, 'skipChannel')
      .mockRejectedValue(new ApiError('Channel is not playing', 409));

    renderComponent();

    expect(await screen.findByText('Live 1')).toBeInTheDocument();

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('snapshot', [
        {
          channel_id: 1,
          state: 'playing',
          item: {
            media_id: 10,
            filename: 'movie.mp4',
            started_at: '2026-01-01T12:00:00Z',
            seek_sec: 10,
            duration_sec: 600,
            remaining_sec: 590,
          },
          skip_offset_sec: 0,
        },
      ]);
    });

    // Skip button should now be enabled because state is playing
    const skipBtn = await screen.findByRole('button', { name: /skip/i });
    expect(skipBtn).not.toBeDisabled();

    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(skipSpy).toHaveBeenCalledWith(1);
    });
  });

  it('disables skip button for scheduled channels', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Scheduled Channel', mode: 'scheduled', created_at: '2026-01-01' },
    ]);

    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      uptime_sec: 3600,
      media_count: 5,
      channel_count: 1,
      running_channels: 1,
      ffmpeg: { path: '/bin/ffmpeg', version: '6.1' },
      idle_clip: { ready: true, size_bytes: 5000, modified_at: '2026-01-01' },
    });

    renderComponent();

    expect(await screen.findByText('Scheduled Channel')).toBeInTheDocument();

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('snapshot', [
        {
          channel_id: 1,
          state: 'playing',
          item: {
            media_id: 10,
            filename: 'movie.mp4',
            started_at: '2026-01-01T12:00:00Z',
            seek_sec: 10,
            duration_sec: 600,
            remaining_sec: 590,
          },
          skip_offset_sec: 0,
        },
      ]);
    });

    const skipBtn = await screen.findByRole('button', {
      name: /skip is unavailable for scheduled channels/i,
    });
    expect(skipBtn).toBeDisabled();
  });

  it('displays viewer count and restart badges from snapshot and SSE updates', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Main Channel', mode: 'loop', created_at: '2026-01-01' },
    ]);

    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      uptime_sec: 7200,
      media_count: 10,
      channel_count: 1,
      running_channels: 1,
      ffmpeg: { path: '/bin/ffmpeg', version: '6.1' },
      idle_clip: { ready: true, size_bytes: 5000, modified_at: '2026-01-01' },
    });

    renderComponent();

    expect(await screen.findByText('Main Channel')).toBeInTheDocument();

    const es = MockEventSource.instances[0];
    act(() => {
      es.emit('snapshot', [
        {
          channel_id: 1,
          state: 'playing',
          item: null,
          skip_offset_sec: 0,
          viewers: 9,
          restarts: 2,
          last_error: 'ffmpeg exit 1',
        },
      ]);
    });

    const viewersBadge = await screen.findByTestId('channel-viewers-1');
    expect(viewersBadge).toHaveTextContent('9');

    const restartsBadge = await screen.findByTestId('channel-restarts-1');
    expect(restartsBadge).toHaveTextContent('2');

    // Update via viewers.update and channel.health
    act(() => {
      es.emit('viewers.update', {
        type: 'viewers.update',
        channel_id: 1,
        data: { viewers: 14 },
        time: '2026-01-01T12:00:00Z',
      });
      es.emit('channel.health', {
        type: 'channel.health',
        channel_id: 1,
        data: { restarts: 3, last_error: 'transcode failure' },
        time: '2026-01-01T12:00:00Z',
      });
    });

    expect(await screen.findByText('14')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});
