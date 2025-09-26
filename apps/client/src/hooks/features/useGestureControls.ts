import { useCallback, useEffect, useRef, useState } from 'react';

interface GestureState {
  scale: number;
  translateX: number;
  translateY: number;
  opacity: number;
}

interface TouchPoint {
  x: number;
  y: number;
  identifier: number;
}

interface UseGestureControlsProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  onTap?: (x: number, y: number) => void;
  enabled?: boolean;
}

const SWIPE_THRESHOLD = 0.3; // 30% of screen width
const SWIPE_VELOCITY_THRESHOLD = 0.5; // pixels per millisecond
const SWIPE_DOWN_THRESHOLD = 200; // pixels
const TAP_THRESHOLD = 10; // pixels
const TAP_TIME_THRESHOLD = 300; // milliseconds

export function useGestureControls({
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  onTap,
  enabled = true,
}: UseGestureControlsProps) {
  const [gestureState, setGestureState] = useState<GestureState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
    opacity: 1,
  });

  const [isGesturing, setIsGesturing] = useState(false);
  const touchesRef = useRef<TouchPoint[]>([]);
  const startTimeRef = useRef<number>(0);
  const startPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startGestureStateRef = useRef<GestureState>({ ...gestureState });
  const directionRef = useRef<'horizontal' | 'vertical' | null>(null);

  // Reset gesture state
  const resetGestureState = useCallback(() => {
    setGestureState({
      scale: 1,
      translateX: 0,
      translateY: 0,
      opacity: 1,
    });
    setIsGesturing(false);
    directionRef.current = null;
  }, []);

  // Animate gesture state to target values
  const animateGestureState = useCallback(
    (target: Partial<GestureState>, onComplete?: () => void) => {
      let animationFrame: number;
      const animate = () => {
        setGestureState((current) => {
          const next = { ...current };
          let isComplete = true;

          // Lerp each property
          const lerpFactor = 0.25;
          for (const key in target) {
            const prop = key as keyof GestureState;
            const targetValue = target[prop]!;
            const currentValue = current[prop];
            const diff = Math.abs(targetValue - currentValue);

            if (diff > 0.01) {
              next[prop] = currentValue + (targetValue - currentValue) * lerpFactor;
              isComplete = false;
            } else {
              next[prop] = targetValue;
            }
          }

          if (!isComplete) {
            animationFrame = requestAnimationFrame(animate);
          } else {
            onComplete?.();
          }

          return next;
        });
      };

      animate();

      return () => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }
      };
    },
    []
  );

  // ★ REMOVED: Distance calculation - no longer needed for single finger gestures

  // Handle touch/pointer start - SINGLE FINGER ONLY
  const handleStart = useCallback(
    (event: TouchEvent | PointerEvent) => {
      if (!enabled) return;

      const touches = 'touches' in event ? Array.from(event.touches) : [event];

      // ★ ONLY HANDLE SINGLE FINGER TOUCHES - Let browser handle multi-finger natively
      if (touches.length > 1) {
        return; // Exit early for multi-finger gestures
      }

      touchesRef.current = touches.map((t) => ({
        x: 'clientX' in t ? t.clientX : (t as any).pageX,
        y: 'clientY' in t ? t.clientY : (t as any).pageY,
        identifier: 'identifier' in t ? t.identifier : 0,
      }));

      startTimeRef.current = Date.now();
      startPositionRef.current = {
        x: touchesRef.current[0].x,
        y: touchesRef.current[0].y,
      };
      startGestureStateRef.current = { ...gestureState };

      // Remove pinch/zoom logic - only single finger allowed
      setIsGesturing(true);
    },
    [enabled, gestureState]
  );

  // Handle touch/pointer move - SINGLE FINGER ONLY
  const handleMove = useCallback(
    (event: TouchEvent | PointerEvent) => {
      if (!enabled || !isGesturing || touchesRef.current.length === 0) return;

      const touches = 'touches' in event ? Array.from(event.touches) : [event];

      // ★ ONLY HANDLE SINGLE FINGER MOVES - Let browser handle multi-finger natively
      if (touches.length > 1) {
        return; // Exit early for multi-finger gestures
      }

      // ★ ONLY preventDefault for single finger - preserve native zoom for multi-finger
      event.preventDefault();

      const currentTouches = touches.map((t) => ({
        x: 'clientX' in t ? t.clientX : (t as any).pageX,
        y: 'clientY' in t ? t.clientY : (t as any).pageY,
        identifier: 'identifier' in t ? t.identifier : 0,
      }));

      // Single touch - pan gesture
      if (currentTouches.length === 1 && touchesRef.current.length === 1) {
        const dx = currentTouches[0].x - startPositionRef.current.x;
        const dy = currentTouches[0].y - startPositionRef.current.y;

        // Determine direction on first significant move
        if (!directionRef.current) {
          if (Math.abs(dx) > 10) {
            directionRef.current = 'horizontal';
          } else if (Math.abs(dy) > 20) {
            directionRef.current = 'vertical';
          }
        }

        // Update gesture state based on direction
        if (directionRef.current === 'horizontal') {
          setGestureState({
            ...startGestureStateRef.current,
            translateX: dx,
          });
        } else if (directionRef.current === 'vertical' && dy > 0) {
          // Only allow downward swipe
          const scale = Math.max(0.1, 1 - dy / 500);
          const opacity = Math.max(0.1, 1 - dy / 1000);
          setGestureState({
            ...startGestureStateRef.current,
            translateY: dy,
            scale,
            opacity,
          });
        }
      }

      // ★ REMOVED: Multi-touch pinch gesture - let browser handle native zoom
    },
    [enabled, isGesturing]
  );

  // Handle touch/pointer end
  const handleEnd = useCallback(
    (event: TouchEvent | PointerEvent) => {
      if (!enabled || !isGesturing) return;

      const endTime = Date.now();
      const duration = endTime - startTimeRef.current;
      const endPosition =
        'changedTouches' in event
          ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
          : { x: event.clientX, y: event.clientY };

      const dx = endPosition.x - startPositionRef.current.x;
      const dy = endPosition.y - startPositionRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check for tap
      if (distance < TAP_THRESHOLD && duration < TAP_TIME_THRESHOLD && onTap) {
        onTap(endPosition.x, endPosition.y);
        resetGestureState();
        return;
      }

      // Check for swipe gestures
      const velocity = distance / duration;
      const screenWidth = window.innerWidth;

      if (directionRef.current === 'horizontal') {
        const swipeThreshold = screenWidth * SWIPE_THRESHOLD;

        if (Math.abs(dx) > swipeThreshold || velocity > SWIPE_VELOCITY_THRESHOLD) {
          if (dx > 0 && onSwipeRight) {
            // Animate off screen to the right
            animateGestureState({ translateX: screenWidth }, () => {
              onSwipeRight();
              resetGestureState();
            });
          } else if (dx < 0 && onSwipeLeft) {
            // Animate off screen to the left
            animateGestureState({ translateX: -screenWidth }, () => {
              onSwipeLeft();
              resetGestureState();
            });
          } else {
            // Snap back
            animateGestureState({ translateX: 0 });
          }
        } else {
          // Snap back
          animateGestureState({ translateX: 0 });
        }
      } else if (directionRef.current === 'vertical') {
        if (dy > SWIPE_DOWN_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) {
          if (onSwipeDown) {
            // Animate down and fade out
            animateGestureState({ translateY: window.innerHeight, scale: 0.5, opacity: 0 }, () => {
              onSwipeDown();
              resetGestureState();
            });
          }
        } else {
          // Snap back
          animateGestureState({ translateY: 0, scale: 1, opacity: 1 });
        }
      } else {
        // No significant gesture, reset
        resetGestureState();
      }

      setIsGesturing(false);
    },
    [
      enabled,
      isGesturing,
      onTap,
      onSwipeLeft,
      onSwipeRight,
      onSwipeDown,
      animateGestureState,
      resetGestureState,
    ]
  );

  // Set up event listeners
  useEffect(() => {
    if (!enabled) return;

    const element = document.documentElement;

    // Touch events
    element.addEventListener('touchstart', handleStart, { passive: false });
    element.addEventListener('touchmove', handleMove, { passive: false });
    element.addEventListener('touchend', handleEnd, { passive: false });
    element.addEventListener('touchcancel', handleEnd, { passive: false });

    // Pointer events for mouse support
    element.addEventListener('pointerdown', handleStart);
    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerup', handleEnd);
    element.addEventListener('pointercancel', handleEnd);

    return () => {
      element.removeEventListener('touchstart', handleStart);
      element.removeEventListener('touchmove', handleMove);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('touchcancel', handleEnd);

      element.removeEventListener('pointerdown', handleStart);
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerup', handleEnd);
      element.removeEventListener('pointercancel', handleEnd);
    };
  }, [enabled, handleStart, handleMove, handleEnd]);

  return {
    gestureState,
    isGesturing,
    resetGestureState,
  };
}
