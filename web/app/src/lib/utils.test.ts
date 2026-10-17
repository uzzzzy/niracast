import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn utility', () => {
  it('combines class names correctly', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('handles conditional classes and falsy values', () => {
    expect(cn('base', false && 'hidden', null, undefined, 'active')).toBe('base active');
  });

  it('resolves conflicting tailwind classes', () => {
    expect(cn('px-2 text-red-500', 'px-4 text-blue-500')).toBe('px-4 text-blue-500');
  });
});
