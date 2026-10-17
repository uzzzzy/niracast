import { type RefObject, useEffect, useRef, useState } from 'react';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface SwipePoint {
  x: number;
  y: number;
  time?: number;
}

export interface SwipeOptions {
  /** Minimum distance in pixels required for a swipe. Default: 50 */
  threshold?: number;
  /** Minimum velocity in px/ms required for a swipe. Default: 0.25 */
  minVelocity?: number;
}

export interface SwipeResult {
  direction: SwipeDirection | null;
  deltaX: number;
  deltaY: number;
  distance: number;
  velocityX: number;
  velocityY: number;
  durationMs: number;
}

/**
 * Pure function to calculate swipe gesture direction and kinematics.
 */
export function detectSwipe(
  start: SwipePoint,
  end: SwipePoint,
  options?: SwipeOptions,
): SwipeResult {
  const threshold = options?.threshold ?? 50;
  const minVelocity = options?.minVelocity ?? 0.25;

  const startTime = start.time ?? 0;
  const endTime = end.time ?? startTime + 1;
  const durationMs = Math.max(1, endTime - startTime);

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  const velocityX = absX / durationMs;
  const velocityY = absY / durationMs;
  const distance = Math.hypot(deltaX, deltaY);

  let direction: SwipeDirection | null = null;

  if (absY > absX) {
    if (absY >= threshold && velocityY >= minVelocity) {
      direction = deltaY < 0 ? 'up' : 'down';
    }
  } else {
    if (absX >= threshold && velocityX >= minVelocity) {
      direction = deltaX < 0 ? 'left' : 'right';
    }
  }

  return {
    direction,
    deltaX,
    deltaY,
    distance,
    velocityX,
    velocityY,
    durationMs,
  };
}

/**
 * Rubber-band resistance helper for pull-to-close or bounce limits.
 * Uses logarithmic decay when pulled past limit.
 */
export function calculateRubberBand(
  offset: number,
  limit = 0,
  damping = 0.35,
  maxStretch = 80,
): number {
  if (offset >= limit) {
    return offset;
  }
  const overpull = limit - offset;
  const resisted = Math.min(maxStretch, overpull * damping);
  return limit - resisted;
}

/**
 * Determines whether a gesture qualifies as a static tap.
 */
export function isTap(
  start: SwipePoint,
  end: SwipePoint,
  maxDistance = 10,
  maxDurationMs = 300,
): boolean {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const startTime = start.time ?? 0;
  const endTime = end.time ?? startTime;
  const duration = Math.max(0, endTime - startTime);
  return distance <= maxDistance && duration <= maxDurationMs;
}

export interface UseSwipeGestureOptions extends SwipeOptions {
  onSwipe?: (direction: SwipeDirection, result: SwipeResult) => void;
  onSwipeUp?: (result: SwipeResult) => void;
  onSwipeDown?: (result: SwipeResult) => void;
  onSwipeLeft?: (result: SwipeResult) => void;
  onSwipeRight?: (result: SwipeResult) => void;
  onMove?: (delta: { deltaX: number; deltaY: number; currentX: number; currentY: number }) => void;
  onStart?: (point: SwipePoint) => void;
  onEnd?: () => void;
  onTap?: (e: { clientX: number; clientY: number }) => void;
  onDoubleTap?: (e: { clientX: number; clientY: number }) => void;
  enabled?: boolean;
}

/**
 * Reusable gesture hook for pointer-based swipe, tap, and double-tap detection.
 */
export function useSwipeGesture<T extends HTMLElement>(
  targetRef: RefObject<T | null>,
  options: UseSwipeGestureOptions = {},
): void {
  const {
    threshold = 50,
    minVelocity = 0.25,
    onSwipe,
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    onMove,
    onStart,
    onEnd,
    onTap,
    onDoubleTap,
    enabled = true,
  } = options;

  const callbacksRef = useRef({
    onSwipe,
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    onMove,
    onStart,
    onEnd,
    onTap,
    onDoubleTap,
  });

  callbacksRef.current = {
    onSwipe,
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    onMove,
    onStart,
    onEnd,
    onTap,
    onDoubleTap,
  };

  useEffect(() => {
    const element = targetRef.current;
    if (!element || !enabled) return;

    let startPoint: SwipePoint | null = null;
    let lastTapPoint: SwipePoint | null = null;
    let tapTimeout: ReturnType<typeof setTimeout> | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.isPrimary === false) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('button') ||
          target.closest('input') ||
          target.closest('a') ||
          target.closest('[role="dialog"]') ||
          target.closest('aside'))
      ) {
        return;
      }

      startPoint = {
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      };
      callbacksRef.current.onStart?.(startPoint);

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!startPoint) return;
      const deltaX = e.clientX - startPoint.x;
      const deltaY = e.clientY - startPoint.y;
      callbacksRef.current.onMove?.({
        deltaX,
        deltaY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!startPoint) return;
      const endPoint: SwipePoint = {
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      };

      const result = detectSwipe(startPoint, endPoint, { threshold, minVelocity });

      if (result.direction) {
        callbacksRef.current.onSwipe?.(result.direction, result);
        if (result.direction === 'up') callbacksRef.current.onSwipeUp?.(result);
        if (result.direction === 'down') callbacksRef.current.onSwipeDown?.(result);
        if (result.direction === 'left') callbacksRef.current.onSwipeLeft?.(result);
        if (result.direction === 'right') callbacksRef.current.onSwipeRight?.(result);
      } else if (isTap(startPoint, endPoint)) {
        const now = performance.now();
        const hasDoubleTapHandler = Boolean(callbacksRef.current.onDoubleTap);

        if (hasDoubleTapHandler) {
          const isSecondTap =
            lastTapPoint &&
            now - (lastTapPoint.time ?? 0) < 300 &&
            Math.hypot(e.clientX - lastTapPoint.x, e.clientY - lastTapPoint.y) < 24;

          if (isSecondTap) {
            if (tapTimeout) {
              clearTimeout(tapTimeout);
              tapTimeout = null;
            }
            lastTapPoint = null;
            callbacksRef.current.onDoubleTap?.({ clientX: e.clientX, clientY: e.clientY });
          } else {
            lastTapPoint = { x: e.clientX, y: e.clientY, time: now };
            if (tapTimeout) clearTimeout(tapTimeout);
            tapTimeout = setTimeout(() => {
              callbacksRef.current.onTap?.({ clientX: e.clientX, clientY: e.clientY });
              lastTapPoint = null;
              tapTimeout = null;
            }, 260);
          }
        } else {
          callbacksRef.current.onTap?.({ clientX: e.clientX, clientY: e.clientY });
        }
      }

      callbacksRef.current.onEnd?.();
      cleanup();
    };

    const handlePointerCancel = () => {
      callbacksRef.current.onEnd?.();
      cleanup();
    };

    const cleanup = () => {
      startPoint = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };

    element.addEventListener('pointerdown', handlePointerDown);

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      cleanup();
      if (tapTimeout) clearTimeout(tapTimeout);
    };
  }, [targetRef, targetRef.current, enabled, threshold, minVelocity]);
}

export interface UseBottomSheetDragOptions {
  onClose: () => void;
  threshold?: number;
  minVelocity?: number;
  enabled?: boolean;
}

/**
 * Reusable hook for swipe-down-to-close behavior on bottom sheets.
 * Provides transform-only rubber band kinematics and pointer event handlers.
 */
export function useBottomSheetDrag({
  onClose,
  threshold = 80,
  minVelocity = 0.25,
  enabled = true,
}: UseBottomSheetDragOptions) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ y: number; time: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!enabled || e.isPrimary === false) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // In jsdom or browsers where setPointerCapture is unsupported
    }
    startRef.current = { y: e.clientY, time: performance.now() };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startRef.current || !isDragging) return;
    const deltaY = e.clientY - startRef.current.y;
    if (deltaY < 0) {
      setDragOffset(calculateRubberBand(deltaY, 0, 0.3, 60));
    } else {
      setDragOffset(deltaY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore releasePointerCapture errors
    }

    const deltaY = e.clientY - startRef.current.y;
    const duration = Math.max(1, performance.now() - startRef.current.time);
    const velocity = deltaY / duration;

    startRef.current = null;
    setIsDragging(false);

    if (deltaY >= threshold || (deltaY > 30 && velocity >= minVelocity)) {
      setDragOffset(0);
      onClose();
    } else {
      setDragOffset(0);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore releasePointerCapture errors
    }
    startRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  return {
    dragOffset,
    isDragging,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      style: { touchAction: 'none' as const },
    },
    sheetStyle: {
      transform: dragOffset !== 0 ? `translateY(${dragOffset}px)` : undefined,
      transition: isDragging ? 'none' : undefined,
    },
  };
}
