import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as apiModule from './lib/api';

function renderWithProviders(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders root page empty state when no channels exist', async () => {
    vi.spyOn(apiModule.api, 'getChannels').mockResolvedValue([]);

    renderWithProviders('/');

    expect(await screen.findByText('No Channels Available')).toBeInTheDocument();
  });

  it('renders viewer page with channel name and now playing item', async () => {
    vi.spyOn(apiModule.api, 'getChannels').mockResolvedValue([
      { id: 1, number: 101, name: 'Retro Cinema', created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(apiModule.api, 'getChannel').mockResolvedValue({
      id: 1,
      number: 101,
      name: 'Retro Cinema',
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(apiModule.api, 'getChannelStatus').mockResolvedValue({
      channel_id: 1,
      state: 'playing',
      item: {
        media_id: 10,
        filename: 'classic_movie.mp4',
        started_at: '2026-01-01T00:00:00Z',
        seek_sec: 120,
        duration_sec: 3600,
        remaining_sec: 3480,
      },
      skip_offset_sec: 0,
    });
    vi.spyOn(apiModule.api, 'getEpg').mockResolvedValue({
      channel_id: 1,
      generated_at: '2026-01-01T00:00:00Z',
      idle: false,
      items: [],
    });

    renderWithProviders('/watch/1');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' }),
    ).toBeInTheDocument();
    expect(screen.getByText('classic_movie.mp4')).toBeInTheDocument();
  });

  it('renders admin shell placeholder with auth check', async () => {
    vi.spyOn(apiModule.api, 'getAuthMe').mockResolvedValue({
      authenticated: false,
      csrf: '',
    });

    renderWithProviders('/admin');

    expect(await screen.findByText('Admin Shell Placeholder')).toBeInTheDocument();
    expect(screen.getByText('Unauthenticated')).toBeInTheDocument();
  });

  it('renders not found page on unknown routes', async () => {
    renderWithProviders('/unknown/deep/route');

    expect(await screen.findByText('404 - Page Not Found')).toBeInTheDocument();
  });
});
