import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleOccurrence } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { ScheduleTimeline } from './ScheduleTimeline';

describe('ScheduleTimeline', () => {
  const timezone = 'Asia/Jakarta';
  const anchor = '2026-10-17T00:00:00.000Z'; // Saturday in Jakarta

  const sampleOccurrences: ScheduleOccurrence[] = [
    {
      slot_id: 1,
      media_id: 10,
      filename: 'morning_news.mp4',
      title: 'Morning News',
      start_at: '2026-10-17T01:00:00.000Z', // 08:00 Jakarta
      end_at: '2026-10-17T02:00:00.000Z', // 09:00 Jakarta
      media_duration_sec: 4000,
      truncated: true,
      short: false,
      recurring: true,
    },
    {
      slot_id: 2,
      media_id: 20,
      filename: 'quick_clip.mp4',
      title: 'Short Feature',
      start_at: '2026-10-17T05:00:00.000Z', // 12:00 Jakarta
      end_at: '2026-10-17T05:30:00.000Z', // 12:30 Jakarta
      media_duration_sec: 1200,
      truncated: false,
      short: true,
      recurring: false,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    setLanguage('id');
  });

  it('renders day view with 1 column and slot occurrences', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    const onMove = vi.fn();

    render(
      <ScheduleTimeline
        occurrences={sampleOccurrences}
        view="day"
        anchor={anchor}
        timezone={timezone}
        onCreate={onCreate}
        onSelect={onSelect}
        onMove={onMove}
      />,
    );

    // Morning News should be rendered
    expect(screen.getByText('Morning News')).toBeInTheDocument();
    // Time label 08:00–09:00
    expect(screen.getByText('08:00–09:00')).toBeInTheDocument();
    // Short Feature should be rendered
    expect(screen.getByText('Short Feature')).toBeInTheDocument();
    // Chips
    expect(screen.getByText('Terpotong')).toBeInTheDocument();
    expect(screen.getByText('Pendek')).toBeInTheDocument();
  });

  it('renders week view with 7 columns', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    const onMove = vi.fn();

    render(
      <ScheduleTimeline
        occurrences={sampleOccurrences}
        view="week"
        anchor={anchor}
        timezone={timezone}
        onCreate={onCreate}
        onSelect={onSelect}
        onMove={onMove}
      />,
    );

    // Days of the week in Indonesian
    expect(screen.getByText('Sen')).toBeInTheDocument();
    expect(screen.getByText('Sel')).toBeInTheDocument();
    expect(screen.getByText('Rab')).toBeInTheDocument();
    expect(screen.getByText('Kam')).toBeInTheDocument();
    expect(screen.getByText('Jum')).toBeInTheDocument();
    expect(screen.getByText('Sab')).toBeInTheDocument();
    expect(screen.getByText('Min')).toBeInTheDocument();
  });

  it('selects slot on click without dragging', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    const onMove = vi.fn();

    render(
      <ScheduleTimeline
        occurrences={sampleOccurrences}
        view="day"
        anchor={anchor}
        timezone={timezone}
        onCreate={onCreate}
        onSelect={onSelect}
        onMove={onMove}
      />,
    );

    const slotBtn = screen.getByRole('button', { name: /Morning News/i });
    fireEvent.pointerDown(slotBtn, { pointerId: 1, clientY: 100, button: 0 });
    fireEvent.pointerUp(slotBtn, { pointerId: 1, clientY: 100 });

    expect(onSelect).toHaveBeenCalledWith(sampleOccurrences[0]);
  });

  it('supports keyboard movement and commit on Enter', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    const onMove = vi.fn();

    render(
      <ScheduleTimeline
        occurrences={sampleOccurrences}
        view="day"
        anchor={anchor}
        timezone={timezone}
        onCreate={onCreate}
        onSelect={onSelect}
        onMove={onMove}
      />,
    );

    const slotBtn = screen.getByRole('button', { name: /Morning News/i });
    slotBtn.focus();

    // Press ArrowDown to move 5 min later
    fireEvent.keyDown(slotBtn, { key: 'ArrowDown' });
    // Press Enter to commit
    fireEvent.keyDown(slotBtn, { key: 'Enter' });

    expect(onMove).toHaveBeenCalledTimes(1);
    const [occ, newStartISO] = onMove.mock.calls[0];
    expect(occ.slot_id).toBe(1);
    // original was 01:00:00 UTC, +5 min = 01:05:00 UTC
    expect(newStartISO).toBe('2026-10-17T01:05:00.000Z');
  });

  it('renders blocks crossing midnight across adjacent columns', () => {
    // Occurrence starting at 23:30 Saturday Jakarta and ending 01:00 Sunday Jakarta
    // 23:30 Jakarta = 16:30 UTC. 01:00 Sunday Jakarta = 18:00 UTC
    const midnightOcc: ScheduleOccurrence = {
      slot_id: 99,
      media_id: 99,
      filename: 'late_movie.mp4',
      title: 'Late Night Movie',
      start_at: '2026-10-17T16:30:00.000Z',
      end_at: '2026-10-17T18:00:00.000Z',
      media_duration_sec: 5400,
      truncated: false,
      short: false,
      recurring: false,
    };

    render(
      <ScheduleTimeline
        occurrences={[midnightOcc]}
        view="week"
        anchor={anchor}
        timezone={timezone}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    // It should appear in both Saturday and Sunday columns
    const movieBlocks = screen.getAllByRole('button', { name: /Late Night Movie/i });
    expect(movieBlocks.length).toBe(2);
  });
});
