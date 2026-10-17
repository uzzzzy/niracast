import { describe, expect, it } from 'vitest';
import { formatTimecode } from './utils';

describe('formatTimecode', () => {
  it('uses M:SS under an hour', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(65)).toBe('1:05');
    expect(formatTimecode(3599)).toBe('59:59');
  });

  it('uses H:MM:SS from one hour up', () => {
    expect(formatTimecode(3600)).toBe('1:00:00');
    expect(formatTimecode(7134)).toBe('1:58:54');
    expect(formatTimecode(9291.7)).toBe('2:34:51');
  });

  it('clamps negative input to zero', () => {
    expect(formatTimecode(-5)).toBe('0:00');
  });
});
