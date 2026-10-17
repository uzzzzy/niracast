import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { SchedulePage } from './SchedulePage';

describe('SchedulePage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    setLanguage('id');
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      uptime_sec: 3600,
      media_count: 5,
      channel_count: 1,
      running_channels: 1,
      timezone: 'Asia/Jakarta',
      ffmpeg: { path: '/bin/ffmpeg', version: '6.1' },
      idle_clip: { ready: true, size_bytes: 100, modified_at: '2026-01-01' },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/channels/1/schedule']}>
          <Routes>
            <Route path="/admin/channels/:id/schedule" element={<SchedulePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('renders channel schedule and shows banner if channel is in loop mode', async () => {
    vi.spyOn(api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Cinema TV',
      mode: 'loop',
      created_at: '2026-01-01',
    });

    vi.spyOn(api, 'getSchedule').mockResolvedValue({
      channel_id: 1,
      timezone: 'Asia/Jakarta',
      slots: [],
      occurrences: [],
    });

    const updateSpy = vi.spyOn(api, 'updateChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Cinema TV',
      mode: 'scheduled',
      created_at: '2026-01-01',
    });

    renderComponent();

    // Channel name rendered
    expect(await screen.findByText('Cinema TV')).toBeInTheDocument();
    // Timezone chip rendered
    expect(screen.getByText(/Zona waktu: Asia\/Jakarta/i)).toBeInTheDocument();
    // Loop mode warning banner
    expect(screen.getByText('Saluran Dalam Mode Loop')).toBeInTheDocument();

    // Click switch to scheduled button
    const switchBtn = screen.getByRole('button', { name: /Beralih ke Mode Terjadwal/i });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(1, {
        number: 1,
        name: 'Cinema TV',
        mode: 'scheduled',
      });
    });
  });

  it('renders EmptyState when there are no slots and opens modal on add slot', async () => {
    vi.spyOn(api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Scheduled Channel',
      mode: 'scheduled',
      created_at: '2026-01-01',
    });

    vi.spyOn(api, 'getSchedule').mockResolvedValue({
      channel_id: 1,
      timezone: 'Asia/Jakarta',
      slots: [],
      occurrences: [],
    });

    renderComponent();

    expect(await screen.findByText('Belum ada slot siaran')).toBeInTheDocument();

    // Click Add Slot
    const addBtns = screen.getAllByRole('button', { name: /tambah slot/i });
    fireEvent.click(addBtns[0]);

    // Modal opens
    expect(await screen.findByRole('heading', { name: /tambah slot/i })).toBeInTheDocument();
  });

  it('renders timeline when slots and occurrences exist', async () => {
    vi.spyOn(api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Scheduled Channel',
      mode: 'scheduled',
      created_at: '2026-01-01',
    });

    vi.spyOn(api, 'getSchedule').mockResolvedValue({
      channel_id: 1,
      timezone: 'Asia/Jakarta',
      slots: [
        {
          id: 10,
          channel_id: 1,
          media_id: 101,
          filename: 'news.mp4',
          title: 'Evening News',
          start_at: '2026-10-17T11:00:00.000Z',
          duration_sec: 3600,
          media_duration_sec: 3600,
          recurrence: 'none',
          until: null,
        },
      ],
      occurrences: [
        {
          slot_id: 10,
          media_id: 101,
          filename: 'news.mp4',
          title: 'Evening News',
          start_at: '2026-10-17T11:00:00.000Z',
          end_at: '2026-10-17T12:00:00.000Z',
          media_duration_sec: 3600,
          truncated: false,
          short: false,
          recurring: false,
        },
      ],
    });

    renderComponent();

    expect(await screen.findByText('Evening News')).toBeInTheDocument();
  });
});
