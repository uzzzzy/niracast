import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { PlaylistEditorPage } from './PlaylistEditorPage';

describe('PlaylistEditorPage', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/channels/1']}>
          <Routes>
            <Route path="/admin/channels/:id" element={<PlaylistEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('loads playlist and allows adding media and saving the right media_ids order', async () => {
    vi.spyOn(api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Channel One',
      mode: 'loop',
      created_at: '2026-01-01',
    });

    vi.spyOn(api, 'getChannelPlaylist').mockResolvedValue({
      channel_id: 1,
      items: [{ media_id: 101, position: 1, filename: 'intro.mp4', duration_sec: 60 }],
      total_duration_sec: 60,
    });

    vi.spyOn(api, 'getMedia').mockResolvedValue([
      {
        id: 202,
        path: '/media/movie.mp4',
        filename: 'movie.mp4',
        duration_sec: 3600,
        codec_video: 'h264',
        codec_audio: 'aac',
        width: 1920,
        height: 1080,
      },
    ]);

    const saveSpy = vi.spyOn(api, 'setChannelPlaylist').mockResolvedValue({
      channel_id: 1,
      items: [
        { media_id: 101, position: 1, filename: 'intro.mp4', duration_sec: 60 },
        { media_id: 202, position: 2, filename: 'movie.mp4', duration_sec: 3600 },
      ],
      total_duration_sec: 3660,
    });

    renderComponent();

    // Verify initial items
    expect(await screen.findByText('intro.mp4')).toBeInTheDocument();
    expect(screen.getByText('movie.mp4')).toBeInTheDocument();

    // Add movie.mp4 to playlist
    const addBtn = screen.getByRole('button', { name: /add movie\.mp4/i });
    fireEvent.click(addBtn);

    // Save button becomes enabled
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      // Verifies the exact array of media_ids sent to the backend
      expect(saveSpy).toHaveBeenCalledWith(1, [101, 202]);
    });
  });

  it('supports duplicate media items and saves correct order', async () => {
    vi.spyOn(api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Loop Channel',
      mode: 'loop',
      created_at: '2026-01-01',
    });

    vi.spyOn(api, 'getChannelPlaylist').mockResolvedValue({
      channel_id: 1,
      items: [{ media_id: 50, position: 1, filename: 'jingle.mp4', duration_sec: 30 }],
      total_duration_sec: 30,
    });

    vi.spyOn(api, 'getMedia').mockResolvedValue([
      {
        id: 50,
        path: '/media/jingle.mp4',
        filename: 'jingle.mp4',
        duration_sec: 30,
        codec_video: 'h264',
        codec_audio: 'aac',
        width: 1280,
        height: 720,
      },
    ]);

    const saveSpy = vi.spyOn(api, 'setChannelPlaylist').mockResolvedValue({
      channel_id: 1,
      items: [
        { media_id: 50, position: 1, filename: 'jingle.mp4', duration_sec: 30 },
        { media_id: 50, position: 2, filename: 'jingle.mp4', duration_sec: 30 },
      ],
      total_duration_sec: 60,
    });

    renderComponent();

    expect(await screen.findByText('jingle.mp4')).toBeInTheDocument();

    // Add same jingle again (duplicate item)
    const addBtn = screen.getByRole('button', { name: /add jingle\.mp4/i });
    fireEvent.click(addBtn);

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(1, [50, 50]);
    });
  });

  it('shows informational banner for scheduled channels', async () => {
    vi.spyOn(api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 1,
      name: 'Scheduled Channel',
      mode: 'scheduled',
      created_at: '2026-01-01',
    });

    vi.spyOn(api, 'getChannelPlaylist').mockResolvedValue({
      channel_id: 1,
      items: [],
      total_duration_sec: 0,
    });

    vi.spyOn(api, 'getMedia').mockResolvedValue([]);

    renderComponent();

    expect(await screen.findByText(/This channel is in Scheduled mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Broadcast Schedule/i })).toBeInTheDocument();
  });
});
