import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Hls from 'hls.js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiModule from '../lib/api';
import { t } from '../lib/i18n';
import ViewerPage from './ViewerPage';

// Mock hls.js
let mockHlsInstances: Array<{
  on: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  loadSource: ReturnType<typeof vi.fn>;
  startLoad: ReturnType<typeof vi.fn>;
  recoverMediaError: ReturnType<typeof vi.fn>;
  swapAudioCodec: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  callbacks: Record<string, ((...args: unknown[]) => void)[]>;
}> = [];

vi.mock('hls.js', () => {
  class MockHls {
    static isSupported = vi.fn(() => true);
    static Events = {
      MEDIA_ATTACHED: 'hlsMediaAttached',
      MANIFEST_PARSED: 'hlsManifestParsed',
      ERROR: 'hlsError',
    };
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
      OTHER_ERROR: 'otherError',
    };
    static ErrorDetails = {
      BUFFER_STALLED_ERROR: 'bufferStalledError',
      MANIFEST_LOAD_ERROR: 'manifestLoadError',
    };

    callbacks: Record<string, ((...args: unknown[]) => void)[]> = {};
    on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!this.callbacks[event]) this.callbacks[event] = [];
      this.callbacks[event].push(cb);
    });
    attachMedia = vi.fn();
    loadSource = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    swapAudioCodec = vi.fn();
    destroy = vi.fn();

    constructor() {
      mockHlsInstances.push(this);
    }
  }

  return {
    default: MockHls,
  };
});

const mockChannels: apiModule.Channel[] = [
  { id: 1, number: 101, name: 'Retro Cinema', created_at: '2026-01-01T00:00:00Z' },
  { id: 2, number: 102, name: 'Anime 24/7', created_at: '2026-01-01T00:00:00Z' },
  { id: 3, number: 103, name: 'News Live', created_at: '2026-01-01T00:00:00Z' },
];

const mockStatusPlaying: apiModule.ChannelStatus = {
  channel_id: 1,
  state: 'playing',
  item: {
    media_id: 10,
    filename: 'classic_movie.mp4',
    started_at: new Date(Date.now() - 30000).toISOString(),
    seek_sec: 30,
    duration_sec: 120,
    remaining_sec: 90,
  },
  skip_offset_sec: 0,
};

const mockStatusIdle: apiModule.ChannelStatus = {
  channel_id: 1,
  state: 'idle',
  item: null,
  skip_offset_sec: 0,
};

const mockEpg: apiModule.EpgResponse = {
  channel_id: 1,
  generated_at: new Date().toISOString(),
  idle: false,
  items: [
    {
      media_id: 10,
      title: 'Classic Movie',
      start_at: new Date(Date.now() - 30000).toISOString(),
      end_at: new Date(Date.now() + 90000).toISOString(),
      duration_sec: 120,
      is_current: true,
    },
    {
      media_id: 11,
      title: 'Next Big Show',
      start_at: new Date(Date.now() + 90000).toISOString(),
      end_at: new Date(Date.now() + 210000).toISOString(),
      duration_sec: 120,
      is_current: false,
    },
  ],
};

function renderViewer(initialRoute = '/watch/1') {
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
        <Routes>
          <Route path="/watch/:id" element={<ViewerPage />} />
          <Route path="/watch/2" element={<div>Navigated to Channel 2</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ViewerPage', () => {
  beforeEach(() => {
    localStorage.setItem('lang', 'id');
    mockHlsInstances = [];
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();

    vi.spyOn(apiModule.api, 'getChannels').mockResolvedValue(mockChannels);
    vi.spyOn(apiModule.api, 'getChannel').mockResolvedValue(mockChannels[0]);
    vi.spyOn(apiModule.api, 'getChannelStatus').mockResolvedValue(mockStatusPlaying);
    vi.spyOn(apiModule.api, 'getEpg').mockResolvedValue(mockEpg);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state while channel is loading', () => {
    vi.spyOn(apiModule.api, 'getChannel').mockReturnValue(new Promise(() => {}));

    renderViewer();

    expect(screen.getByText(t('loading_channel'))).toBeInTheDocument();
  });

  it('renders playing HUD with channel information, live badge, and now playing title', async () => {
    renderViewer();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' }),
    ).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByTestId('live-badge')).toBeInTheDocument();
    expect(screen.getByText('classic_movie.mp4')).toBeInTheDocument();
    expect(screen.getAllByText('Next Big Show').length).toBeGreaterThanOrEqual(1);
  });

  it('renders idle card when channel status state is idle', async () => {
    vi.spyOn(apiModule.api, 'getChannelStatus').mockResolvedValue(mockStatusIdle);

    renderViewer();

    expect(await screen.findByTestId('idle-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: t('idle_title') })).toBeInTheDocument();
    expect(screen.getByTestId('idle-badge')).toBeInTheDocument();
  });

  it('renders error overlay with retry button when phase is error', async () => {
    renderViewer();

    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });
    expect(mockHlsInstances.length).toBe(1);
    const firstHls = mockHlsInstances[0];

    // Trigger other fatal error twice -> phase transitions to error
    act(() => {
      const cbs = firstHls.callbacks[Hls.Events.ERROR] || [];
      for (const cb of cbs) {
        cb(Hls.Events.ERROR, {
          fatal: true,
          type: Hls.ErrorTypes.OTHER_ERROR,
          details: 'Network timeout',
        });
      }
    });

    expect(mockHlsInstances.length).toBe(2);
    const secondHls = mockHlsInstances[1];

    act(() => {
      const cbs = secondHls.callbacks[Hls.Events.ERROR] || [];
      for (const cb of cbs) {
        cb(Hls.Events.ERROR, {
          fatal: true,
          type: Hls.ErrorTypes.OTHER_ERROR,
          details: 'Network timeout',
        });
      }
    });

    expect(await screen.findByTestId('player-error')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: new RegExp(t('retry'), 'i') });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(mockHlsInstances.length).toBe(3);
    expect(screen.queryByTestId('player-error')).not.toBeInTheDocument();
  });

  it('handles keyboard shortcuts: M toggles muted, C opens drawer, ArrowDown navigates', async () => {
    renderViewer();

    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    // M: toggle mute
    fireEvent.keyDown(window, { key: 'm' });
    // Channel drawer: C
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByRole('dialog', { name: t('channels') })).toBeInTheDocument();

    // Esc closes panels
    fireEvent.keyDown(window, { key: 'Escape' });
    const drawer = screen.getByRole('dialog', { name: t('channels') });
    expect(drawer).toHaveClass('translate-x-full');

    // ArrowDown navigates to next channel (Channel 2)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(await screen.findByText('Navigated to Channel 2')).toBeInTheDocument();
  });

  it('program guide sheet lists EPG items with start time, duration, and Now marker', async () => {
    renderViewer();

    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    // Press G to open guide sheet
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByRole('dialog', { name: t('program_guide') })).toBeInTheDocument();

    // Verify items in guide sheet
    expect(screen.getByText('Classic Movie')).toBeInTheDocument();
    expect(screen.getAllByText('Next Big Show').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(t('now'))).toBeInTheDocument();
  });

  it('handles HUD auto-hide timer using fake timers', async () => {
    renderViewer();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });
    expect(heading).toBeInTheDocument();

    // Switch to fake timers
    vi.useFakeTimers();

    const container = document.querySelector('.fixed.inset-0') as HTMLElement;
    expect(container).toHaveClass('cursor-default');

    // Reset timer on fake clock via pointer move
    act(() => {
      fireEvent.pointerMove(container);
    });

    // Advance 3s -> HUD hides, container gets cursor-none
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(container).toHaveClass('cursor-none');

    // Move pointer -> HUD wakes up, container gets cursor-default
    act(() => {
      fireEvent.pointerMove(container);
    });

    expect(container).toHaveClass('cursor-default');

    vi.useRealTimers();
  });
});

describe('TV Mode ViewerPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'id');
    localStorage.setItem('ui', 'tv');
    mockHlsInstances = [];
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();

    vi.spyOn(apiModule.api, 'getChannels').mockResolvedValue(mockChannels);
    vi.spyOn(apiModule.api, 'getChannel').mockResolvedValue(mockChannels[0]);
    vi.spyOn(apiModule.api, 'getChannelStatus').mockResolvedValue(mockStatusPlaying);
    vi.spyOn(apiModule.api, 'getEpg').mockResolvedValue(mockEpg);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    delete document.documentElement.dataset.ui;
    vi.restoreAllMocks();
  });

  it('sets data-ui attribute on document.documentElement via useUiProfile', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });
    expect(document.documentElement.dataset.ui).toBe('tv');
  });

  it('navigates to next channel on ArrowDown when HUD is not open', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(await screen.findByText('Navigated to Channel 2')).toBeInTheDocument();
  });

  it('increases volume on ArrowRight and shows volume toast', async () => {
    localStorage.setItem('viewer.volume', '0.5');
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('volume-toast')).toBeInTheDocument();
    expect(localStorage.getItem('viewer.volume')).toBe('0.55');
  });

  it('opens HUD menu and lands focus on the first control on OK (Enter)', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    // Press OK (Enter)
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    await new Promise((r) => setTimeout(r, 100));

    const muteBtn = screen.getByRole('button', { name: new RegExp(t('mute'), 'i') });
    expect(document.activeElement).toBe(muteBtn);
  });

  it('closes layers progressively with Back (shortcuts -> guide -> HUD menu)', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    // Open HUD first
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    await new Promise((r) => setTimeout(r, 60));

    // Open Guide
    fireEvent.keyDown(window, { key: 'Guide' });
    expect(screen.getByRole('dialog', { name: t('program_guide') })).toBeInTheDocument();

    // Open Remote Legend via remote button
    const legendBtn = screen.getByRole('button', {
      name: new RegExp(t('remote_legend_title'), 'i'),
    });
    fireEvent.click(legendBtn);
    expect(screen.getByRole('dialog', { name: t('remote_legend_title') })).toBeInTheDocument();

    // 1st Back closes remote legend
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: t('remote_legend_title') }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: t('program_guide') })).toBeInTheDocument();

    // 2nd Back closes guide sheet
    fireEvent.keyDown(window, { key: 'Escape' });
    const guideSheet = screen.getByRole('dialog', { name: t('program_guide') });
    expect(guideSheet).toHaveClass('translate-y-full');

    // 3rd Back closes HUD
    fireEvent.keyDown(window, { key: 'Escape' });
    const hud = screen
      .getByRole('dialog', { name: t('program_guide') })
      .parentElement?.querySelector('.transition-hud');
    expect(hud).toHaveClass('opacity-0');

    // 4th Back when nothing is open: preventDefault called, stays on page
    const backEvt = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(backEvt);
    expect(backEvt.defaultPrevented).toBe(true);
  });

  it('digit entry navigates to channel number after idle timeout (fake timers)', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    vi.useFakeTimers();

    // Type 1, 0, 2
    act(() => {
      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: '2' });
    });

    const overlay = screen.getByTestId('digit-entry-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent('102');

    // Advance 1.5s idle timer
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    vi.useRealTimers();
    expect(await screen.findByText('Navigated to Channel 2')).toBeInTheDocument();
  });

  it('unknown channel number shows error message and shakes', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    vi.useFakeTimers();

    // Type 9, 9, 9 (non-existent channel)
    act(() => {
      fireEvent.keyDown(window, { key: '9' });
      fireEvent.keyDown(window, { key: '9' });
      fireEvent.keyDown(window, { key: '9' });
    });

    const overlay = screen.getByTestId('digit-entry-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent('999');

    // Advance 1.5s idle timer -> commits and fails
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.getByTestId('digit-error-message')).toBeInTheDocument();
    expect(screen.getByText(t('no_such_channel'))).toBeInTheDocument();

    vi.useRealTimers();
  });
});

describe('Mobile Mode ViewerPage (?ui=mobile)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'id');
    localStorage.setItem('ui', 'mobile');
    mockHlsInstances = [];
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();

    vi.spyOn(apiModule.api, 'getChannels').mockResolvedValue(mockChannels);
    vi.spyOn(apiModule.api, 'getChannel').mockResolvedValue(mockChannels[0]);
    vi.spyOn(apiModule.api, 'getChannelStatus').mockResolvedValue(mockStatusPlaying);
    vi.spyOn(apiModule.api, 'getEpg').mockResolvedValue(mockEpg);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    delete document.documentElement.dataset.ui;
    vi.restoreAllMocks();
  });

  it('sets data-ui="mobile" attribute on document.documentElement via useUiProfile', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });
    expect(document.documentElement.dataset.ui).toBe('mobile');
  });

  it('opens channel drawer as bottom sheet with drag handle and closes it', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    // Open Channels bottom sheet
    const channelsBtn = screen.getByRole('button', { name: new RegExp(t('channels'), 'i') });
    fireEvent.click(channelsBtn);

    const sheet = screen.getByRole('dialog', { name: t('channels') });
    expect(sheet).toBeInTheDocument();

    // Verify drag handle is present
    const dragHandle = within(sheet).getByLabelText(t('drag_handle'));
    expect(dragHandle).toBeInTheDocument();

    // Close via close button
    const closeBtn = within(sheet).getByRole('button', { name: t('close') });
    fireEvent.click(closeBtn);

    expect(sheet).toHaveClass('pointer-events-none');
  });

  it('opens program guide bottom sheet with drag handle and closes it', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    // Open Program Guide bottom sheet
    const guideBtn = screen.getByRole('button', { name: new RegExp(t('program_guide'), 'i') });
    fireEvent.click(guideBtn);

    const sheet = screen.getByRole('dialog', { name: t('program_guide') });
    expect(sheet).toBeInTheDocument();

    const dragHandle = within(sheet).getByLabelText(t('drag_handle'));
    expect(dragHandle).toBeInTheDocument();

    const closeBtn = within(sheet).getByRole('button', { name: t('close') });
    fireEvent.click(closeBtn);

    expect(sheet).toHaveClass('pointer-events-none');
  });

  it('switches channel on vertical swipe up using pointer events', async () => {
    renderViewer();
    await screen.findByRole('heading', { level: 1, name: 'Retro Cinema' });

    const container = screen
      .getByRole('heading', { level: 1, name: 'Retro Cinema' })
      .closest('div.fixed.inset-0');
    expect(container).toBeInTheDocument();
    if (!container) throw new Error('Container not found');

    // Simulate pointer swipe up: clientY 400 -> 150
    act(() => {
      container.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 200, clientY: 400, isPrimary: true }),
      );
    });

    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 200, clientY: 150, isPrimary: true }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 200, clientY: 150, isPrimary: true }),
      );
    });

    expect(await screen.findByText('Navigated to Channel 2')).toBeInTheDocument();
  });
});
