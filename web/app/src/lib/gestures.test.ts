import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateRubberBand,
  detectSwipe,
  isTap,
  useBottomSheetDrag,
  useSwipeGesture,
} from './gestures';

describe('detectSwipe pure function', () => {
  it('detects swipe up when deltaY is negative and velocity is above minVelocity', () => {
    const start = { x: 100, y: 300, time: 0 };
    const end = { x: 105, y: 150, time: 200 }; // deltaY = -150, velocity = 0.75 px/ms
    const result = detectSwipe(start, end, { threshold: 50, minVelocity: 0.25 });

    expect(result.direction).toBe('up');
    expect(result.deltaY).toBe(-150);
    expect(result.velocityY).toBeCloseTo(0.75);
  });

  it('detects swipe down when deltaY is positive and velocity is above minVelocity', () => {
    const start = { x: 100, y: 100, time: 0 };
    const end = { x: 110, y: 260, time: 200 }; // deltaY = 160, velocity = 0.8 px/ms
    const result = detectSwipe(start, end, { threshold: 50, minVelocity: 0.25 });

    expect(result.direction).toBe('down');
    expect(result.deltaY).toBe(160);
    expect(result.velocityY).toBeCloseTo(0.8);
  });

  it('detects swipe left when deltaX is negative and larger than deltaY', () => {
    const start = { x: 300, y: 100, time: 0 };
    const end = { x: 100, y: 105, time: 200 }; // deltaX = -200, velocity = 1.0 px/ms
    const result = detectSwipe(start, end, { threshold: 50, minVelocity: 0.25 });

    expect(result.direction).toBe('left');
    expect(result.deltaX).toBe(-200);
    expect(result.velocityX).toBeCloseTo(1.0);
  });

  it('detects swipe right when deltaX is positive and larger than deltaY', () => {
    const start = { x: 100, y: 100, time: 0 };
    const end = { x: 280, y: 95, time: 200 }; // deltaX = 180, velocity = 0.9 px/ms
    const result = detectSwipe(start, end, { threshold: 50, minVelocity: 0.25 });

    expect(result.direction).toBe('right');
    expect(result.deltaX).toBe(180);
    expect(result.velocityX).toBeCloseTo(0.9);
  });

  it('returns null direction when movement is below distance threshold', () => {
    const start = { x: 100, y: 100, time: 0 };
    const end = { x: 100, y: 130, time: 50 }; // distance = 30 < 50
    const result = detectSwipe(start, end, { threshold: 50, minVelocity: 0.25 });

    expect(result.direction).toBeNull();
  });

  it('returns null direction when velocity is below minVelocity threshold', () => {
    const start = { x: 100, y: 100, time: 0 };
    const end = { x: 100, y: 200, time: 1000 }; // distance = 100, duration = 1000ms, velocity = 0.1 < 0.25
    const result = detectSwipe(start, end, { threshold: 50, minVelocity: 0.25 });

    expect(result.direction).toBeNull();
  });
});

describe('calculateRubberBand pure function', () => {
  it('returns unresisted offset when offset >= limit', () => {
    expect(calculateRubberBand(50, 0)).toBe(50);
    expect(calculateRubberBand(0, 0)).toBe(0);
  });

  it('applies damping resistance when offset < limit', () => {
    const resisted = calculateRubberBand(-100, 0, 0.35, 80);
    expect(resisted).toBeLessThan(0);
    expect(resisted).toBe(-35); // -100 * 0.35
  });

  it('caps rubber-band pull at maxStretch', () => {
    const resisted = calculateRubberBand(-1000, 0, 0.35, 80);
    expect(resisted).toBe(-80);
  });
});

describe('isTap pure function', () => {
  it('returns true for quick, minimal displacement gesture', () => {
    const start = { x: 100, y: 100, time: 100 };
    const end = { x: 104, y: 103, time: 220 };
    expect(isTap(start, end, 10, 300)).toBe(true);
  });

  it('returns false when displacement exceeds maxDistance', () => {
    const start = { x: 100, y: 100, time: 100 };
    const end = { x: 130, y: 100, time: 150 };
    expect(isTap(start, end, 10, 300)).toBe(false);
  });

  it('returns false when duration exceeds maxDurationMs', () => {
    const start = { x: 100, y: 100, time: 100 };
    const end = { x: 102, y: 101, time: 500 };
    expect(isTap(start, end, 10, 300)).toBe(false);
  });
});

describe('useSwipeGesture hook with DOM Pointer Events', () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    vi.useRealTimers();
    target.remove();
  });

  it('triggers onSwipeDown when user swipes down on target element', () => {
    const onSwipeDown = vi.fn();
    const onSwipe = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(target);
      useSwipeGesture(ref, {
        threshold: 40,
        minVelocity: 0.1,
        onSwipe,
        onSwipeDown,
      });
    });

    // Simulate pointerdown
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 150,
        clientY: 100,
        isPrimary: true,
      }),
    );

    // Simulate pointermove
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 152,
        clientY: 220,
        isPrimary: true,
      }),
    );

    // Simulate pointerup
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 152,
        clientY: 220,
        isPrimary: true,
      }),
    );

    expect(onSwipe).toHaveBeenCalledWith('down', expect.objectContaining({ direction: 'down' }));
    expect(onSwipeDown).toHaveBeenCalled();
  });

  it('triggers onSwipeUp when user swipes up on target element', () => {
    const onSwipeUp = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(target);
      useSwipeGesture(ref, {
        threshold: 40,
        minVelocity: 0.1,
        onSwipeUp,
      });
    });

    target.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 150, clientY: 300, isPrimary: true }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 150, clientY: 120, isPrimary: true }),
    );

    expect(onSwipeUp).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'up', deltaY: -180 }),
    );
  });

  it('detects tap and triggers onTap callback after tap timeout', () => {
    const onTap = vi.fn();
    const onDoubleTap = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(target);
      useSwipeGesture(ref, {
        onTap,
        onDoubleTap,
      });
    });

    target.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 150, clientY: 150, isPrimary: true }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 152, clientY: 151, isPrimary: true }),
    );

    expect(onTap).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onTap).toHaveBeenCalledWith({ clientX: 152, clientY: 151 });
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('detects double tap and suppresses single tap', () => {
    const onTap = vi.fn();
    const onDoubleTap = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(target);
      useSwipeGesture(ref, {
        onTap,
        onDoubleTap,
      });
    });

    // First tap
    target.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 150, clientY: 150, isPrimary: true }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 150, clientY: 150, isPrimary: true }),
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Second tap within 300ms
    target.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 152, clientY: 151, isPrimary: true }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 152, clientY: 151, isPrimary: true }),
    );

    expect(onDoubleTap).toHaveBeenCalledWith({ clientX: 152, clientY: 151 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('useBottomSheetDrag hook', () => {
  it('updates dragOffset on pointerdown and pointermove and calls onClose when released past threshold', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useBottomSheetDrag({
        onClose,
        threshold: 60,
      }),
    );

    expect(result.current.dragOffset).toBe(0);
    expect(result.current.sheetStyle.transform).toBeUndefined();

    // Simulate pointerdown
    act(() => {
      result.current.dragHandleProps.onPointerDown({
        clientY: 100,
        pointerId: 1,
        currentTarget: {
          setPointerCapture: vi.fn(),
          releasePointerCapture: vi.fn(),
        },
      } as unknown as React.PointerEvent);
    });

    // Simulate pointermove down by 80px
    act(() => {
      result.current.dragHandleProps.onPointerMove({
        clientY: 180,
      } as unknown as React.PointerEvent);
    });

    expect(result.current.dragOffset).toBe(80);
    expect(result.current.sheetStyle.transform).toBe('translateY(80px)');

    // Simulate pointerup
    act(() => {
      result.current.dragHandleProps.onPointerUp({
        clientY: 180,
        pointerId: 1,
        currentTarget: {
          releasePointerCapture: vi.fn(),
        },
      } as unknown as React.PointerEvent);
    });

    expect(onClose).toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it('resets dragOffset and does not call onClose when released below threshold', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useBottomSheetDrag({
        onClose,
        threshold: 80,
        minVelocity: 0.5,
      }),
    );

    act(() => {
      result.current.dragHandleProps.onPointerDown({
        clientY: 100,
        pointerId: 1,
      } as unknown as React.PointerEvent);
    });

    act(() => {
      result.current.dragHandleProps.onPointerMove({
        clientY: 120,
      } as unknown as React.PointerEvent);
    });

    expect(result.current.dragOffset).toBe(20);

    act(() => {
      result.current.dragHandleProps.onPointerUp({
        clientY: 120,
        pointerId: 1,
      } as unknown as React.PointerEvent);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it('applies rubber band resistance when pulled upwards (negative delta)', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useBottomSheetDrag({
        onClose,
      }),
    );

    act(() => {
      result.current.dragHandleProps.onPointerDown({
        clientY: 200,
        pointerId: 1,
      } as unknown as React.PointerEvent);
    });

    act(() => {
      result.current.dragHandleProps.onPointerMove({
        clientY: 100, // dragged up by -100px
      } as unknown as React.PointerEvent);
    });

    // Should be resisted negative number
    expect(result.current.dragOffset).toBeLessThan(0);
    expect(result.current.dragOffset).toBeGreaterThan(-100);
  });
});
