import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, type MediaFile, type ScheduleSlot } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { SlotModal } from './SlotModal';

describe('SlotModal', () => {
  let queryClient: QueryClient;
  const timezone = 'Asia/Jakarta';

  const mockMediaList: MediaFile[] = [
    {
      id: 1,
      path: '/media/movie.mp4',
      filename: 'movie.mp4',
      duration_sec: 7200, // 2 hours
      codec_video: 'h264',
      codec_audio: 'aac',
      width: 1920,
      height: 1080,
    },
    {
      id: 2,
      path: '/media/short.mp4',
      filename: 'short.mp4',
      duration_sec: 600, // 10 mins
      codec_video: 'h264',
      codec_audio: 'aac',
      width: 1920,
      height: 1080,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    setLanguage('id');
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.spyOn(api, 'getMedia').mockResolvedValue(mockMediaList);
  });

  const renderComponent = (props: Partial<React.ComponentProps<typeof SlotModal>> = {}) =>
    render(
      <QueryClientProvider client={queryClient}>
        <SlotModal
          isOpen={true}
          onClose={vi.fn()}
          channelId={1}
          timezone={timezone}
          onSave={vi.fn()}
          {...props}
        />
      </QueryClientProvider>,
    );

  it('renders modal with fields and defaults duration when media is selected', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderComponent({ onSave });

    // Wait for media options to load
    await screen.findByRole('option', { name: /movie\.mp4/i });

    // Select media
    const select = screen.getByLabelText(/media/i);
    fireEvent.change(select, { target: { value: '1' } });

    // Duration should auto-fill to 7200
    const durationInput = screen.getByLabelText(/durasi slot/i) as HTMLInputElement;
    expect(durationInput.value).toBe('7200');

    // Change slot duration to 3600 (less than 7200) -> should show truncated warning
    fireEvent.change(durationInput, { target: { value: '3600' } });
    expect(screen.getByText(/Media lebih panjang dari durasi slot/i)).toBeInTheDocument();

    // Fill date and time
    const dateInput = screen.getByLabelText(/tanggal/i);
    const timeInput = screen.getByLabelText(/waktu mulai/i);
    fireEvent.change(dateInput, { target: { value: '2026-10-17' } });
    fireEvent.change(timeInput, { target: { value: '14:00' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        media_id: 1,
        // 14:00 Jakarta is 07:00 UTC
        start_at: '2026-10-17T07:00:00.000Z',
        duration_sec: 3600,
        recurrence: 'none',
        until: null,
      });
    });
  });

  it('displays 409 conflict error inline with conflicting programme info', async () => {
    const conflictError = new ApiError('Schedule conflict', 409, undefined, {
      error: 'schedule_conflict',
      message: 'Slot overlaps with another broadcast',
      conflict: {
        slot_id: 42,
        title: 'Breaking News',
        start_at: '2026-10-17T07:00:00.000Z', // 14:00 Jakarta
        end_at: '2026-10-17T08:00:00.000Z', // 15:00 Jakarta
      },
    });

    const onSave = vi.fn().mockRejectedValue(conflictError);
    renderComponent({ onSave });

    await screen.findByRole('option', { name: /movie\.mp4/i });

    const select = screen.getByLabelText(/media/i);
    fireEvent.change(select, { target: { value: '1' } });

    const dateInput = screen.getByLabelText(/tanggal/i);
    const timeInput = screen.getByLabelText(/waktu mulai/i);
    fireEvent.change(dateInput, { target: { value: '2026-10-17' } });
    fireEvent.change(timeInput, { target: { value: '14:00' } });

    fireEvent.click(screen.getByRole('button', { name: /simpan/i }));

    expect(
      await screen.findByText(/Jadwal bentrok dengan: Breaking News \(14:00–15:00\)/i),
    ).toBeInTheDocument();
  });

  it('supports editing and deleting a slot', async () => {
    const slotToEdit: ScheduleSlot = {
      id: 99,
      channel_id: 1,
      media_id: 2,
      filename: 'short.mp4',
      title: 'Short',
      start_at: '2026-10-17T03:00:00.000Z', // 10:00 Jakarta
      duration_sec: 600,
      media_duration_sec: 600,
      recurrence: 'daily',
      until: null,
    };

    const onDelete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent({ slotToEdit, onDelete });

    expect(await screen.findByText('Ubah Slot')).toBeInTheDocument();
    const deleteBtn = screen.getByRole('button', { name: /hapus slot/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(99);
    });
  });
});
