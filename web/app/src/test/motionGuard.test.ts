// @ts-expect-error Node fs module is available at test runtime
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Motion Architectural Guard Tests', () => {
  it('strictly ensures src/features/viewer/** and src/pages/ViewerPage.tsx never import the motion library', () => {
    // Eagerly import all viewer files and ViewerPage as raw strings using Vite's glob feature
    const viewerFiles = import.meta.glob<string>(
      ['../features/viewer/**/*.{ts,tsx}', '../pages/ViewerPage.tsx'],
      { query: '?raw', import: 'default', eager: true },
    );

    const fileEntries = Object.entries(viewerFiles).filter(
      ([filePath]) => !filePath.includes('.test.'),
    );

    expect(fileEntries.length).toBeGreaterThan(1);

    const violatingFiles: Array<{ file: string; line: string }> = [];
    const motionImportRegex = /from\s+['"]motion(\/.*)?['"]|import\s+['"]motion(\/.*)?['"]/;

    for (const [filePath, content] of fileEntries) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (motionImportRegex.test(line)) {
          violatingFiles.push({
            file: filePath,
            line: `L${i + 1}: ${line.trim()}`,
          });
        }
      }
    }

    expect(
      violatingFiles,
      `Violation: Viewer files must remain lightweight and cannot import the 'motion' library: ${JSON.stringify(
        violatingFiles,
        null,
        2,
      )}`,
    ).toEqual([]);
  });

  it('strictly ensures index.css never animates layout properties (width/height/top/left/margin)', () => {
    const rawCss = fs.readFileSync('src/index.css', 'utf-8');

    expect(typeof rawCss).toBe('string');
    expect(rawCss.length).toBeGreaterThan(0);

    const forbiddenProps = [
      'width',
      'height',
      'top',
      'left',
      'bottom',
      'right',
      'margin',
      'padding',
    ];

    // 1. Scan transition-property declarations
    const transitionPropertyRegex = /transition-property\s*:\s*([^;]+);/gi;
    const transitionMatches = Array.from(rawCss.matchAll(transitionPropertyRegex));
    for (const match of transitionMatches) {
      const m = match as RegExpExecArray;
      const propValue = m[1].toLowerCase();
      for (const forbidden of forbiddenProps) {
        const regex = new RegExp(`\\b${forbidden}\\b`);
        expect(
          regex.test(propValue),
          `Violation: index.css transition-property contains layout property '${forbidden}': '${m[0]}'`,
        ).toBe(false);
      }
    }

    // 2. Scan inside @keyframes definitions
    const keyframesRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gi;
    const keyframeMatches = Array.from(rawCss.matchAll(keyframesRegex));
    for (const match of keyframeMatches) {
      const m = match as RegExpExecArray;
      const keyframeName = m[1];
      const keyframeBody = m[2].toLowerCase();

      for (const forbidden of forbiddenProps) {
        const forbiddenPattern = new RegExp(`(?:^|[;\\{\\s])${forbidden}(?:-[a-z]+)?\\s*:`, 'i');
        expect(
          forbiddenPattern.test(keyframeBody),
          `Violation: @keyframes '${keyframeName}' animates layout property '${forbidden}'`,
        ).toBe(false);
      }
    }
  });
});
