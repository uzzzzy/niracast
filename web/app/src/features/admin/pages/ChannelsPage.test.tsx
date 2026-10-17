import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { ChannelsPage } from './ChannelsPage';

describe('ChannelsPage', () => {
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
        <MemoryRouter>
          <ChannelsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('renders channels table and creates a new channel', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Cinema TV', mode: 'loop', created_at: '2026-01-01' },
    ]);
    const createSpy = vi.spyOn(api, 'createChannel').mockResolvedValue({
      id: 2,
      number: 2,
      name: 'Sports 24',
      mode: 'loop',
      created_at: '2026-01-02',
    });

    renderComponent();

    expect(await screen.findByText('Cinema TV')).toBeInTheDocument();

    // Click Create Channel button
    fireEvent.click(screen.getByRole('button', { name: /create channel/i }));

    // Modal opens
    const numberInput = screen.getByLabelText(/channel number/i);
    const nameInput = screen.getByLabelText(/channel name/i);

    fireEvent.change(numberInput, { target: { value: '2' } });
    fireEvent.change(nameInput, { target: { value: 'Sports 24' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({ number: 2, name: 'Sports 24', mode: 'loop' });
    });
  });

  it('shows server 409 duplicate-number message inline in channel modal', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Cinema TV', mode: 'loop', created_at: '2026-01-01' },
    ]);
    vi.spyOn(api, 'createChannel').mockRejectedValue(
      new ApiError('Channel number already exists', 409),
    );

    renderComponent();

    expect(await screen.findByText('Cinema TV')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create channel/i }));

    fireEvent.change(screen.getByLabelText(/channel number/i), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(/channel name/i), {
      target: { value: 'Duplicate News' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/already in use by another channel/i)).toBeInTheDocument();
  });

  it('handles delete confirmation flow', async () => {
    vi.spyOn(api, 'getChannels').mockResolvedValue([
      { id: 1, number: 1, name: 'Cinema TV', mode: 'loop', created_at: '2026-01-01' },
    ]);
    const deleteSpy = vi.spyOn(api, 'deleteChannel').mockResolvedValue();

    renderComponent();

    expect(await screen.findByText('Cinema TV')).toBeInTheDocument();

    // Click delete channel action button
    const deleteBtn = screen.getByRole('button', { name: /delete channel/i });
    fireEvent.click(deleteBtn);

    // Verify confirmation modal states channel and playlist will be removed
    expect(
      await screen.findByText(/entire playlist will be permanently removed/i),
    ).toBeInTheDocument();

    // Click confirm delete in modal
    const dialogs = screen.getAllByRole('dialog');
    const deleteDialog = dialogs.find((d) => d.textContent?.includes('entire playlist'));
    expect(deleteDialog).toBeDefined();

    const confirmBtn = within(deleteDialog as HTMLElement).getByRole('button', {
      name: /delete channel/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(1);
    });
  });
});
