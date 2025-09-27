import { useCallback, useEffect, useMemo, useRef } from 'react';

type SwipeDirection = 'left' | 'right';
type PointerKind = 'touch' | 'pen' | 'mouse';

interface UseSwipeCloseOptions {
  direction: SwipeDirection;
  onClose: () => void;
  isActive: boolean;
  threshold?: number;
  pointerTypes?: PointerKind[];
}

interface Point {
  x: number;
  y: number;
}

function shouldHandlePointer(pointerType: string, allowed: PointerKind[]): boolean {
  if (pointerType === '') return true; // 一部ブラウザで pointerType が空になるケースを救済
  return allowed.includes(pointerType as PointerKind);
}

export function useSwipeClose<T extends HTMLElement>({
  direction,
  onClose,
  isActive,
  threshold,
  pointerTypes = ['touch', 'pen'],
}: UseSwipeCloseOptions) {
  const elementRef = useRef<T | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const isHorizontalSwipeRef = useRef(false);
  const preparedRef = useRef(false);
  const offsetRef = useRef(0);
  const rafRef = useRef<number>();
  const fallbackTimerRef = useRef<number>();
  const cleanupRafRef = useRef<number>();
  const originalTransformRef = useRef<string>('');
  const originalTransitionRef = useRef<string>('');
  const closingRef = useRef(false);

  const setRef = useCallback((node: T | null) => {
    elementRef.current = node;
  }, []);

  const pointerTypesKey = pointerTypes.join(',');
  const allowedPointerTypes = useMemo<PointerKind[]>(() => {
    const list = pointerTypesKey
      .split(',')
      .map((type) => type.trim())
      .filter((type): type is PointerKind => type === 'touch' || type === 'pen' || type === 'mouse');

    if (list.length === 0) {
      return ['touch', 'pen'];
    }

    return Array.from(new Set(list));
  }, [pointerTypesKey]);

  const resolvedThreshold = useMemo(() => {
    if (typeof threshold === 'number') return threshold;
    if (typeof window === 'undefined') return 80; // サーバーレンダリング安全対策
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (Number.isFinite(rootFontSize) && rootFontSize > 0) {
      return rootFontSize * 5; // 5em を標準閾値にする
    }
    return 80;
  }, [threshold]);

  const clearAnimationFrame = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
  };

  const clearTimers = () => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = undefined;
    }
  };

  const prepareElement = () => {
    if (preparedRef.current) return;
    const element = elementRef.current;
    if (!element) return;
    preparedRef.current = true;
    originalTransformRef.current = element.style.transform;
    originalTransitionRef.current = element.style.transition;
    element.style.transition = 'none';
    element.style.willChange = 'transform';
  };

  const applyOffset = (offset: number) => {
    const element = elementRef.current;
    if (!element) return;
    clearAnimationFrame();
    rafRef.current = window.requestAnimationFrame(() => {
      const currentElement = elementRef.current;
      if (!currentElement) return;
      currentElement.style.transform = `translate3d(${offset}px, 0, 0)`;
    });
  };

  const resetElementStyles = () => {
    const element = elementRef.current;
    preparedRef.current = false;
    clearAnimationFrame();
    if (cleanupRafRef.current) {
      cancelAnimationFrame(cleanupRafRef.current);
      cleanupRafRef.current = undefined;
    }
    if (!element) return;
    element.style.transition = originalTransitionRef.current;
    element.style.transform = originalTransformRef.current;
    element.style.willChange = '';
    originalTransitionRef.current = '';
    originalTransformRef.current = '';
  };

  const animateTo = (
    target: number,
    duration: number,
    easing: string,
    onComplete?: () => void
  ) => {
    const element = elementRef.current;
    if (!element) {
      onComplete?.();
      return;
    }

    clearTimers();
    clearAnimationFrame();
    element.style.transition = `transform ${duration}ms ${easing}`;
    element.style.transform = `translate3d(${target}px, 0, 0)`;

    const finish = () => {
      element.removeEventListener('transitionend', finish);
      clearTimers();
      onComplete?.();
    };

    element.addEventListener('transitionend', finish, { once: true });
    fallbackTimerRef.current = window.setTimeout(finish, duration + 80);
  };

  const releasePointerCapture = () => {
    const element = elementRef.current;
    const pointerId = pointerIdRef.current;
    if (!element || pointerId === null) return;
    if (element.hasPointerCapture?.(pointerId)) {
      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // Safari などで throw するケースを無視
      }
    }
  };

  const resetGestureState = () => {
    pointerIdRef.current = null;
    startPointRef.current = null;
    isHorizontalSwipeRef.current = false;
    offsetRef.current = 0;
  };

  const handleCancel = (animateBack: boolean) => {
    if (animateBack && preparedRef.current) {
      animateTo(0, 220, 'cubic-bezier(0.18, 0.89, 0.32, 1.28)', () => {
        resetElementStyles();
      });
    } else {
      resetElementStyles();
    }
    releasePointerCapture();
    resetGestureState();
  };

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isActive) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!shouldHandlePointer(event.pointerType, allowedPointerTypes)) return;

      pointerIdRef.current = event.pointerId;
      startPointRef.current = { x: event.clientX, y: event.clientY };
      isHorizontalSwipeRef.current = false;
      offsetRef.current = 0;
      closingRef.current = false;

      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Safari などは setPointerCapture をサポートしない場合があるため無視
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      if (!startPointRef.current) return;

      const dx = event.clientX - startPointRef.current.x;
      const dy = event.clientY - startPointRef.current.y;

      if (!isHorizontalSwipeRef.current) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          isHorizontalSwipeRef.current = true;
          prepareElement();
        } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          handleCancel(true);
          return;
        }
      }

      if (!isHorizontalSwipeRef.current) {
        return;
      }

      event.preventDefault();

      const constrainedDx = direction === 'left' ? Math.min(0, dx) : Math.max(0, dx);
      offsetRef.current = constrainedDx;
      applyOffset(constrainedDx);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      releasePointerCapture();

      if (!isHorizontalSwipeRef.current) {
        resetGestureState();
        return;
      }

      const offset = offsetRef.current;
      const shouldClose =
        (direction === 'left' && offset <= -resolvedThreshold) ||
        (direction === 'right' && offset >= resolvedThreshold);

      if (shouldClose) {
        closingRef.current = true;
        const elementWidth = element.getBoundingClientRect().width || resolvedThreshold;
        const target = direction === 'left' ? -elementWidth : elementWidth;
        animateTo(target, 180, 'ease-in', () => {
          closingRef.current = false;
          onClose();
          // 状態更新後の再描画でクラスベースの transform が適用されるよう、次フレームでスタイルをクリア
          if (cleanupRafRef.current) {
            cancelAnimationFrame(cleanupRafRef.current);
          }
          cleanupRafRef.current = window.requestAnimationFrame(() => {
            resetElementStyles();
            cleanupRafRef.current = undefined;
          });
        });
      } else {
        animateTo(0, 220, 'cubic-bezier(0.18, 0.89, 0.32, 1.28)', () => {
          resetElementStyles();
        });
      }

      resetGestureState();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      handleCancel(true);
    };

    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerEnd);
    element.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerEnd);
      element.removeEventListener('pointercancel', handlePointerCancel);
      clearTimers();
      if (cleanupRafRef.current) {
        cancelAnimationFrame(cleanupRafRef.current);
        cleanupRafRef.current = undefined;
      }
      if (!closingRef.current) {
        resetElementStyles();
      }
      resetGestureState();
    };
  }, [allowedPointerTypes, direction, isActive, onClose, resolvedThreshold]);

  useEffect(() => {
    if (!isActive) {
      clearTimers();
      if (cleanupRafRef.current) {
        cancelAnimationFrame(cleanupRafRef.current);
        cleanupRafRef.current = undefined;
      }
      if (!closingRef.current) {
        resetElementStyles();
      }
    }
    return () => {
      clearTimers();
      if (cleanupRafRef.current) {
        cancelAnimationFrame(cleanupRafRef.current);
        cleanupRafRef.current = undefined;
      }
      resetElementStyles();
    };
  }, [isActive]);

  return setRef;
}
