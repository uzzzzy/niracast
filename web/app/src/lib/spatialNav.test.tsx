import { fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  computeDistance,
  findBestCandidate,
  isInHalfPlane,
  type Rect,
  useSpatialNav,
} from './spatialNav';

function makeRect(left: number, top: number, width: number, height: number): Rect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe('Spatial Navigation Geometry', () => {
  describe('isInHalfPlane', () => {
    const cur = makeRect(100, 100, 50, 50); // [100,100,150,150]

    it('identifies candidates in the half-plane correctly with overlap tolerance', () => {
      const above = makeRect(100, 40, 50, 50); // [100,40,150,90] -> bottom 90 <= top 100 + 2
      expect(isInHalfPlane(cur, above, 'up')).toBe(true);
      expect(isInHalfPlane(cur, above, 'down')).toBe(false);

      const below = makeRect(100, 160, 50, 50); // [100,160,150,210] -> top 160 >= bottom 150 - 2
      expect(isInHalfPlane(cur, below, 'down')).toBe(true);
      expect(isInHalfPlane(cur, below, 'up')).toBe(false);

      const left = makeRect(40, 100, 50, 50);
      expect(isInHalfPlane(cur, left, 'left')).toBe(true);
      expect(isInHalfPlane(cur, left, 'right')).toBe(false);

      const right = makeRect(160, 100, 50, 50);
      expect(isInHalfPlane(cur, right, 'right')).toBe(true);
      expect(isInHalfPlane(cur, right, 'left')).toBe(false);
    });

    it('rejects candidate on perpendicular axis without directional progress', () => {
      const beside = makeRect(160, 100, 50, 50);
      // 'up' expects candidate.top < cur.top
      expect(isInHalfPlane(cur, beside, 'up')).toBe(false);
      expect(isInHalfPlane(cur, beside, 'down')).toBe(false);
    });
  });

  describe('findBestCandidate in Grid layout', () => {
    // 3x3 Grid of 50x50 cells with 20px gap
    // Col 0: left 0..50
    // Col 1: left 70..120
    // Col 2: left 140..190
    // Row 0: top 0..50
    // Row 1: top 70..120
    // Row 2: top 140..190
    const grid = [
      { element: 'r0c0', rect: makeRect(0, 0, 50, 50) },
      { element: 'r0c1', rect: makeRect(70, 0, 50, 50) },
      { element: 'r0c2', rect: makeRect(140, 0, 50, 50) },
      { element: 'r1c0', rect: makeRect(0, 70, 50, 50) },
      { element: 'r1c1', rect: makeRect(70, 70, 50, 50) },
      { element: 'r1c2', rect: makeRect(140, 70, 50, 50) },
      { element: 'r2c0', rect: makeRect(0, 140, 50, 50) },
      { element: 'r2c1', rect: makeRect(70, 140, 50, 50) },
      { element: 'r2c2', rect: makeRect(140, 140, 50, 50) },
    ];

    it('navigates from center r1c1 in all four directions', () => {
      const center = grid.find((c) => c.element === 'r1c1');
      expect(center).toBeDefined();
      if (!center) return;
      const candidates = grid.filter((c) => c !== center);

      expect(findBestCandidate(center.rect, candidates, 'up')).toBe('r0c1');
      expect(findBestCandidate(center.rect, candidates, 'down')).toBe('r2c1');
      expect(findBestCandidate(center.rect, candidates, 'left')).toBe('r1c0');
      expect(findBestCandidate(center.rect, candidates, 'right')).toBe('r1c2');
    });

    it('returns null (stays) at grid boundaries when wrap is disabled', () => {
      const topLeft = grid.find((c) => c.element === 'r0c0');
      expect(topLeft).toBeDefined();
      if (!topLeft) return;
      const candidates = grid.filter((c) => c !== topLeft);

      expect(findBestCandidate(topLeft.rect, candidates, 'up')).toBeNull();
      expect(findBestCandidate(topLeft.rect, candidates, 'left')).toBeNull();

      const bottomRight = grid.find((c) => c.element === 'r2c2');
      expect(bottomRight).toBeDefined();
      if (!bottomRight) return;
      const bottomCandidates = grid.filter((c) => c !== bottomRight);

      expect(findBestCandidate(bottomRight.rect, bottomCandidates, 'down')).toBeNull();
      expect(findBestCandidate(bottomRight.rect, bottomCandidates, 'right')).toBeNull();
    });
  });

  describe('findBestCandidate in Rail + Row layout', () => {
    // Left vertical rail: x: 0..200
    // Rail item 1: y: 0..80
    // Rail item 2: y: 90..170
    // Rail item 3: y: 180..260
    //
    // Right content rows: x: 250..600
    // Content row 1: y: 10..70
    // Content row 2: y: 100..160
    // Content row 3: y: 190..250
    const railItem1 = { element: 'rail-1', rect: makeRect(0, 0, 200, 80) };
    const railItem2 = { element: 'rail-2', rect: makeRect(0, 90, 200, 80) };
    const railItem3 = { element: 'rail-3', rect: makeRect(0, 180, 200, 80) };

    const rowItem1 = { element: 'row-1', rect: makeRect(250, 10, 350, 60) };
    const rowItem2 = { element: 'row-2', rect: makeRect(250, 100, 350, 60) };
    const rowItem3 = { element: 'row-3', rect: makeRect(250, 190, 350, 60) };

    const allCandidates = [railItem1, railItem2, railItem3, rowItem1, rowItem2, rowItem3];

    it('navigates vertically along the rail', () => {
      const candidates = allCandidates.filter((c) => c !== railItem1);
      expect(findBestCandidate(railItem1.rect, candidates, 'down')).toBe('rail-2');
    });

    it('crosses from rail into the nearest row item when moving right', () => {
      const candidates = allCandidates.filter((c) => c !== railItem2);
      expect(findBestCandidate(railItem2.rect, candidates, 'right')).toBe('row-2');
    });

    it('crosses from row back to rail when moving left', () => {
      const candidates = allCandidates.filter((c) => c !== rowItem2);
      expect(findBestCandidate(rowItem2.rect, candidates, 'left')).toBe('rail-2');
    });
  });

  describe('ties and overlap tolerance', () => {
    it('breaks ties deterministically by selecting the first candidate in array', () => {
      const current = makeRect(100, 100, 50, 50);
      const candA = { element: 'candA', rect: makeRect(50, 20, 50, 50) };
      const candB = { element: 'candB', rect: makeRect(150, 20, 50, 50) };

      expect(findBestCandidate(current, [candA, candB], 'up')).toBe('candA');
      expect(findBestCandidate(current, [candB, candA], 'up')).toBe('candB');
    });

    it('respects overlap tolerance of 2px for tightly touching elements', () => {
      const elA = makeRect(0, 0, 100, 100);
      const elB = makeRect(0, 99, 100, 100);

      expect(isInHalfPlane(elA, elB, 'down')).toBe(true);
      expect(computeDistance(elA, elB, 'down')).toBe(0);
    });
  });
});

describe('useSpatialNav Hook', () => {
  it('traps focus inside an open group (data-nav-group) and remembers last focused', () => {
    const { container } = render(
      <div>
        <div data-nav-group="drawer">
          <button type="button" id="d1">
            Drawer 1
          </button>
          <button type="button" id="d2">
            Drawer 2
          </button>
        </div>
        <div data-nav-group="main">
          <button type="button" id="m1">
            Main 1
          </button>
        </div>
      </div>,
    );

    const d1 = container.querySelector('#d1') as HTMLButtonElement;
    const d2 = container.querySelector('#d2') as HTMLButtonElement;
    const m1 = container.querySelector('#m1') as HTMLButtonElement;

    d1.getBoundingClientRect = () => makeRect(0, 0, 100, 50) as DOMRect;
    d2.getBoundingClientRect = () => makeRect(0, 60, 100, 50) as DOMRect;
    m1.getBoundingClientRect = () => makeRect(200, 0, 100, 50) as DOMRect;

    const containerRef = { current: container };
    const { result } = renderHook(() => useSpatialNav(containerRef, true));

    // Focus drawer 1
    d1.focus();
    expect(document.activeElement).toBe(d1);

    // Press ArrowDown -> moves to d2 inside drawer
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(d2);

    // Focus main group via helper
    result.current.focusGroup('main');
    expect(document.activeElement).toBe(m1);

    // Returning to drawer group restores d2 (last focused)
    result.current.focusGroup('drawer');
    expect(document.activeElement).toBe(d2);
  });
});
