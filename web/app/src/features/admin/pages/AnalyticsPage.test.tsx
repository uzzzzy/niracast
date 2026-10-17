import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { MockEventSource } from '../../../test/mockEventSource';
import { AdminEventsProvider } from '../hooks/useAdminEvents';
import { AnalyticsPage } from './AnalyticsPage';

describe('AnalyticsPage', () => {
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

    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Channel One', mode: 'loop', created_at: '2026-01-01' },
      { id: 2, number: 2, name: 'Channel Two', mode: 'scheduled', created_at: '2026-01-01' },
    ]);

    vi.spyOn(api, 'getAnalyticsLive').mockResolvedValue({
      total_viewers: 15,
      channels: [
        { channel_id: 1, viewers: 10, restarts: 0, last_error: '' },
        { channel_id: 2, viewers: 5, restarts: 1, last_error: 'exit status 1' },
      ],
    });

    vi.spyOn(api, 'getAnalyticsTimeseries').mockResolvedValue({
      range: '24h',
      points: [
        {
          ts: '2026-10-18T10:00:00Z',
          viewers_peak: 8,
          bytes_out: 10485760, // 10 MB
          watch_sec: 1800,
        },
        {
          ts: '2026-10-18T11:00:00Z',
          viewers_peak: 20,
          bytes_out: 20971520, // 20 MB
          watch_sec: 3600,
        },
      ],
    });

    vi.spyOn(api, 'getAnalyticsTopMedia').mockResolvedValue({
      items: [
        { media_id: 1, title: 'Documentary Earth', watch_sec: 7200 },
        { media_id: 2, title: 'Evening News', watch_sec: 3600 },
      ],
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
          <AnalyticsPage />
        </AdminEventsProvider>
      </QueryClientProvider>,
    );

  it('renders analytics metrics, charts, and top media correctly', async () => {
    renderComponent();

    expect(await screen.findByText('Broadcast Analytics')).toBeInTheDocument();

    // Summary StatTiles
    expect(await screen.findByText('Current Viewers')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument(); // total_viewers
    expect(screen.getByText('Peak Viewers')).toBeInTheDocument();
    expect(screen.getAllByText('20').length).toBeGreaterThanOrEqual(1);

    // Charts
    expect(screen.getByRole('heading', { name: 'Viewer Trends' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bandwidth Delivered' })).toBeInTheDocument();

    // Top media items
    expect(screen.getAllByText('Documentary Earth').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Evening News').length).toBeGreaterThanOrEqual(1);

    // Playout health table
    expect(screen.getByRole('heading', { name: 'Channel Playout Health' })).toBeInTheDocument();
    expect(screen.getByText('Channel One')).toBeInTheDocument();
    expect(screen.getByText('Channel Two')).toBeInTheDocument();
  });

  it('switches time range and refetches timeseries and top media', async () => {
    const timeseriesSpy = vi.spyOn(api, 'getAnalyticsTimeseries');
    const topMediaSpy = vi.spyOn(api, 'getAnalyticsTopMedia');

    renderComponent();
    expect(await screen.findByText('Broadcast Analytics')).toBeInTheDocument();

    const range7dButton = screen.getByRole('radio', { name: /7 days/i });
    fireEvent.click(range7dButton);

    await waitFor(() => {
      expect(timeseriesSpy).toHaveBeenCalledWith('7d', 0);
      expect(topMediaSpy).toHaveBeenCalledWith('7d');
    });

    const range1hButton = screen.getByRole('radio', { name: /1 hour/i });
    fireEvent.click(range1hButton);

    await waitFor(() => {
      expect(timeseriesSpy).toHaveBeenCalledWith('1h', 0);
      expect(topMediaSpy).toHaveBeenCalledWith('1h');
    });
  });

  it('updates live viewers and restarts dynamically via SSE events', async () => {
    renderComponent();
    expect(await screen.findByText('Broadcast Analytics')).toBeInTheDocument();

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    // 1. Send viewers.update for total viewers (channel_id: 0)
    act(() => {
      es.emit('viewers.update', {
        type: 'viewers.update',
        channel_id: 0,
        data: { viewers: 42 },
        time: '2026-10-18T12:00:00Z',
      });
    });

    expect(await screen.findByText('42')).toBeInTheDocument();

    // 2. Send channel.health event for channel 1
    act(() => {
      es.emit('channel.health', {
        type: 'channel.health',
        channel_id: 1,
        data: { restarts: 4, last_error: 'segment transcode timeout' },
        time: '2026-10-18T12:00:00Z',
      });
    });

    // Channel 1 restarts badge should appear
    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('renders empty states when no analytics or top media data is returned', async () => {
    vi.spyOn(api, 'getAnalyticsTimeseries').mockResolvedValue({
      range: '24h',
      points: [],
    });

    vi.spyOn(api, 'getAnalyticsTopMedia').mockResolvedValue({
      items: [],
    });

    renderComponent();
    expect(await screen.findByText('Broadcast Analytics')).toBeInTheDocument();

    const emptyDataNotices = await screen.findAllByText(
      'No analytics data available for this range.',
    );
    expect(emptyDataNotices.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('No media watch history recorded yet.')).toBeInTheDocument();
  });
});
