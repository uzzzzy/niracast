import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EpgItem } from '../../../lib/api';
import { setLanguage } from '../../../lib/i18n';
import { ProgramGuideSheet } from './ProgramGuideSheet';

describe('ProgramGuideSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('id');
  });

  it('renders normal programme items with font-medium and slate items with muted text without title emphasis', () => {
    const items: EpgItem[] = [
      {
        media_id: 1,
        title: 'Morning Talk Show',
        start_at: '2026-10-17T01:00:00Z',
        end_at: '2026-10-17T02:00:00Z',
        duration_sec: 3600,
        is_current: true,
        kind: 'programme',
      },
      {
        media_id: 0,
        title: 'Siaran Segera Kembali',
        start_at: '2026-10-17T02:00:00Z',
        end_at: '2026-10-17T02:30:00Z',
        duration_sec: 1800,
        is_current: false,
        kind: 'slate',
      },
    ];

    render(
      <ProgramGuideSheet isOpen={true} onClose={vi.fn()} items={items} channelName="Channel 1" />,
    );

    const normalTitle = screen.getByText('Morning Talk Show');
    expect(normalTitle).toHaveClass('font-medium');
    expect(normalTitle).toHaveClass('text-fg');
    expect(normalTitle).not.toHaveClass('text-fg-subtle');

    const slateTitle = screen.getByText('Siaran Segera Kembali');
    expect(slateTitle).toHaveClass('text-fg-subtle');
    expect(slateTitle).not.toHaveClass('font-medium');
  });
});
