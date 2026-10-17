import { describe, expect, it } from 'vitest';

// Colours must come from the semantic tokens in src/index.css (see docs/DESIGN.md),
// so the dark/light themes and the viewer's .scheme-dark scope apply everywhere.
describe('Design Token Guard Tests', () => {
  const sources = import.meta.glob<string>(
    [
      '../features/**/*.{ts,tsx}',
      '../pages/**/*.{ts,tsx}',
      '../components/**/*.{ts,tsx}',
      '../App.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
  );

  const entries = Object.entries(sources).filter(([filePath]) => !filePath.includes('.test.'));

  function findViolations(pattern: RegExp): Array<{ file: string; line: string }> {
    const violations: Array<{ file: string; line: string }> = [];
    for (const [filePath, content] of entries) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          violations.push({ file: filePath, line: `L${i + 1}: ${lines[i].trim()}` });
        }
      }
    }
    return violations;
  }

  it('scans the UI sources', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('never uses arbitrary hex colour utilities such as bg-[#16161B]', () => {
    const violations = findViolations(/\[#[0-9a-fA-F]{3,8}\]/);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('never hard-codes the legacy palette hex values', () => {
    const violations = findViolations(/#(0B0B0E|16161B|22222A|F5F5F7|8E8E93|0A84FF)\b/i);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('never uses raw backdrop-blur utilities (use the .glass* materials instead)', () => {
    const violations = findViolations(/\bbackdrop-blur(-[a-z0-9]+)?\b/);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
