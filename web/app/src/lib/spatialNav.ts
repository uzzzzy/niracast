/**
 * In-house 2D Spatial Navigation Engine & React Hook.
 *
 * Decision change vs the roadmap: implement a tiny in-house spatial navigation
 * instead of an external library, because it is ~150 lines, fully unit-testable,
 * and avoids dependency churn.
 */

import { useCallback, useEffect, useRef } from 'react';

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CandidateTarget<T = HTMLElement> {
  element: T;
  rect: Rect;
}

const OVERLAP_TOLERANCE = 2;
const PERPENDICULAR_WEIGHT = 2.0;

/**
 * Checks if a candidate rect lies within the half-plane of the given direction
 * relative to the current focused rect, allowing an overlap tolerance.
 */
export function isInHalfPlane(
  current: Rect,
  candidate: Rect,
  direction: NavDirection,
  tolerance = OVERLAP_TOLERANCE,
): boolean {
  switch (direction) {
    case 'up':
      return candidate.bottom <= current.top + tolerance && candidate.top < current.top;
    case 'down':
      return candidate.top >= current.bottom - tolerance && candidate.bottom > current.bottom;
    case 'left':
      return candidate.right <= current.left + tolerance && candidate.left < current.left;
    case 'right':
      return candidate.left >= current.right - tolerance && candidate.right > current.right;
  }
}

/**
 * Computes spatial navigation distance between the current rect and candidate rect.
 * Formula: primary-axis distance + weighted perpendicular offset.
 */
export function computeDistance(
  current: Rect,
  candidate: Rect,
  direction: NavDirection,
  weight = PERPENDICULAR_WEIGHT,
): number {
  const currentCenterX = current.left + current.width / 2;
  const currentCenterY = current.top + current.height / 2;
  const candidateCenterX = candidate.left + candidate.width / 2;
  const candidateCenterY = candidate.top + candidate.height / 2;

  let primaryDist = 0;
  let perpOffset = 0;

  switch (direction) {
    case 'up':
      primaryDist = Math.max(0, current.top - candidate.bottom);
      perpOffset = Math.abs(currentCenterX - candidateCenterX);
      break;
    case 'down':
      primaryDist = Math.max(0, candidate.top - current.bottom);
      perpOffset = Math.abs(currentCenterX - candidateCenterX);
      break;
    case 'left':
      primaryDist = Math.max(0, current.left - candidate.right);
      perpOffset = Math.abs(currentCenterY - candidateCenterY);
      break;
    case 'right':
      primaryDist = Math.max(0, candidate.left - current.right);
      perpOffset = Math.abs(currentCenterY - candidateCenterY);
      break;
  }

  return primaryDist + perpOffset * weight;
}

/**
 * Pure geometry: finds the best candidate in the specified direction.
 * Nearest candidate using primary-axis distance + weighted perpendicular offset.
 * Candidates must lie in the half-plane with overlap tolerance.
 * Ties are broken deterministically (first candidate encountered).
 * Wrap is disabled: returns null if no valid candidate exists in direction.
 */
export function findBestCandidate<T = HTMLElement>(
  currentRect: Rect,
  candidates: Array<CandidateTarget<T>>,
  direction: NavDirection,
): T | null {
  let bestCandidate: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isInHalfPlane(currentRect, candidate.rect, direction)) {
      continue;
    }

    const dist = computeDistance(currentRect, candidate.rect, direction);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestCandidate = candidate.element;
    }
  }

  return bestCandidate;
}

const FOCUSABLE_SELECTOR =
  '[data-focusable], button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]';

/**
 * Hook to enable spatial D-pad navigation over focusable descendants.
 * Supports focus groups via `data-nav-group` (stay inside the open panel; trap while a drawer/sheet is open),
 * and remembers the last focused element per group so returning restores it.
 */
export function useSpatialNav(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled = true,
  options?: {
    activeGroup?: string;
  },
) {
  const lastFocusedByGroup = useRef<Map<string, HTMLElement>>(new Map());

  const getFocusableElements = useCallback(
    (groupFilter?: string): HTMLElement[] => {
      const container = containerRef.current;
      if (!container) return [];

      const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

      return all.filter((el) => {
        if (el.hasAttribute('disabled')) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;

        // Skip elements with tabindex="-1" unless explicitly marked data-focusable
        if (el.getAttribute('tabindex') === '-1' && !el.hasAttribute('data-focusable')) {
          return false;
        }

        // Check CSS visibility
        if (typeof window !== 'undefined') {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
          }
        }

        // If group filter is active, ensure element belongs to this group
        if (groupFilter) {
          const elGroup = el.closest('[data-nav-group]')?.getAttribute('data-nav-group');
          if (elGroup !== groupFilter) return false;
        }

        return true;
      });
    },
    [containerRef],
  );

  const focusGroup = useCallback(
    (groupId: string): boolean => {
      // 1. Try restoring last focused element in group
      const last = lastFocusedByGroup.current.get(groupId);
      if (last && document.body.contains(last)) {
        last.focus();
        last.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return true;
      }

      // 2. Otherwise focus first element of group
      const elements = getFocusableElements(groupId);
      if (elements.length > 0) {
        elements[0].focus();
        elements[0].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        lastFocusedByGroup.current.set(groupId, elements[0]);
        return true;
      }

      return false;
    },
    [getFocusableElements],
  );

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let direction: NavDirection | null = null;
      if (e.key === 'ArrowUp') direction = 'up';
      else if (e.key === 'ArrowDown') direction = 'down';
      else if (e.key === 'ArrowLeft') direction = 'left';
      else if (e.key === 'ArrowRight') direction = 'right';

      if (!direction) return;

      const active = document.activeElement as HTMLElement | null;
      const container = containerRef.current;
      if (!container) return;

      // Determine active nav group (if focused element is inside a group, or an option activeGroup is enforced)
      const currentGroup =
        options?.activeGroup ?? active?.closest('[data-nav-group]')?.getAttribute('data-nav-group');

      const focusables = getFocusableElements(currentGroup ?? undefined);
      if (focusables.length === 0) return;

      // If activeElement is not within focusables, focus the first one or restored one
      if (!active || !focusables.includes(active)) {
        const target =
          (currentGroup && lastFocusedByGroup.current.get(currentGroup)) || focusables[0];
        target.focus();
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        e.preventDefault();
        return;
      }

      // Remember last focused
      if (currentGroup) {
        lastFocusedByGroup.current.set(currentGroup, active);
      }

      const currentRect = active.getBoundingClientRect();
      const candidates: Array<CandidateTarget<HTMLElement>> = [];

      for (const el of focusables) {
        if (el === active) continue;
        const rect = el.getBoundingClientRect();
        candidates.push({ element: el, rect });
      }

      const best = findBestCandidate(currentRect, candidates, direction);
      if (best) {
        e.preventDefault();
        best.focus();
        best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

        const bestGroup = best.closest('[data-nav-group]')?.getAttribute('data-nav-group');
        if (bestGroup) {
          lastFocusedByGroup.current.set(bestGroup, best);
        }
      }
      // If no candidate (nothing in direction) -> stay, wrap disabled
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, containerRef, getFocusableElements, options?.activeGroup]);

  return {
    focusGroup,
    getFocusableElements,
  };
}
