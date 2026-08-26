import { useEffect, useRef, useState } from 'react';
import {
  type ActivePinchGesture,
  beginPinchGesture,
  includesPinchPointer,
  type PinchPointerPosition,
  updatePinchGesture,
} from './pinch-gesture';

interface TapZoneOverlayProps {
  onLeftTap: () => void;
  onRightTap: () => void;
  onCenterTap?: () => void;
  onDrag?: (deltaX: number) => void;
  onDragEnd?: (deltaX: number, velocity: number) => void;
  onVerticalDrag?: (deltaY: number, progress: number) => void;
  onVerticalDragEnd?: (deltaY: number, velocity: number, progress: number) => void;
  onWheelZoom?: (clientX: number, clientY: number, deltaY: number) => void;
  onPinchStart?: (clientX: number, clientY: number) => void;
  onPinchZoom?: (clientX: number, clientY: number, scaleMultiplier: number) => void;
  onPinchEnd?: () => void;
  onZoomPan?: (deltaX: number, deltaY: number) => void;
  onDoubleTap?: () => void;
  onAltDragStart?: (point: PointerPosition) => boolean;
  onContextMenuCancelRequest?: () => void;
  onLeftZoneLongPress?: () => void;
  onRightZoneLongPress?: () => void;
  enabled?: boolean;
  contentArea?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  disableDrag?: boolean;
  isZoomed?: boolean;
  interactionLocked?: boolean;
}

interface PointerPosition {
  x: number;
  y: number;
}

const LONG_PRESS_ARM_OFFSET_PX = 14;
const LONG_PRESS_ARM_OPACITY = 0.8;
const LONG_PRESS_ARM_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

function LongPressArmIndicator({ side }: { side: 'left' | 'right' }) {
  const barRef = useRef<HTMLDivElement>(null);
  const isLeft = side === 'left';
  const outwardOffset = isLeft ? -LONG_PRESS_ARM_OFFSET_PX : LONG_PRESS_ARM_OFFSET_PX;

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = `translate3d(${outwardOffset}px, 0, 0)`;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.style.opacity = `${LONG_PRESS_ARM_OPACITY}`;
        el.style.transform = 'translate3d(0, 0, 0)';
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [outwardOffset]);

  return (
    <div
      ref={barRef}
      className={`absolute top-0 bottom-0 w-[6px] will-change-[transform,opacity] ${isLeft ? 'left-0' : 'right-0'}`}
      style={{
        backgroundColor: 'var(--color-primary)',
        opacity: 0,
        transform: `translate3d(${outwardOffset}px, 0, 0)`,
        transition: `opacity 300ms ${LONG_PRESS_ARM_EASING}, transform 300ms ${LONG_PRESS_ARM_EASING}`,
        pointerEvents: 'none',
      }}
    />
  );
}

export default function TapZoneOverlay({
  onLeftTap,
  onRightTap,
  onCenterTap,
  onDrag,
  onDragEnd,
  onVerticalDrag,
  onVerticalDragEnd,
  onWheelZoom,
  onPinchStart,
  onPinchZoom,
  onPinchEnd,
  onZoomPan,
  onDoubleTap,
  onAltDragStart,
  onContextMenuCancelRequest,
  onLeftZoneLongPress,
  onRightZoneLongPress,
  enabled = true,
  contentArea = { top: 0, left: 0, right: 0, bottom: 0 },
  disableDrag = false,
  isZoomed = false,
  interactionLocked = false,
}: TapZoneOverlayProps) {
  const startPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const activePointersRef = useRef<Map<number, PinchPointerPosition>>(new Map());
  const multiTouchRef = useRef(false);
  const pinchGestureRef = useRef<ActivePinchGesture | null>(null);
  const lastZoomTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const TAP_THRESHOLD = 10; // pixels
  const TAP_TIME_THRESHOLD = 300; // milliseconds
  const DOUBLE_TAP_TIME_THRESHOLD = 320; // milliseconds
  const DOUBLE_TAP_DISTANCE_THRESHOLD = 32; // pixels
  const DIRECTION_LOCK_THRESHOLD = 6; // pixels - quicker direction lock on touch
  const LONG_PRESS_ARM_DELAY = 250; // milliseconds - delay before arming the long-press (below the 700ms context menu long-press)
  const isDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);
  const lastDragYRef = useRef(0);
  const activePointerRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const longPressRef = useRef<{
    pointerId: number;
    side: 'left' | 'right';
    callback: () => void;
    armed: boolean;
  } | null>(null);
  const [armedSide, setArmedSide] = useState<'left' | 'right' | null>(null);

  // Pointer handlers bound to interaction layer (excludes bottom safe area)
  useEffect(() => {
    const overlay = interactionRef.current;
    if (!enabled || !overlay) return;

    if (interactionLocked) {
      activePointersRef.current.clear();
      multiTouchRef.current = false;
      pinchGestureRef.current = null;
      activePointerRef.current = null;
      startPosRef.current = null;
      isDraggingRef.current = false;
      dragDirectionRef.current = null;
    }

    const clearLongPress = () => {
      if (armTimerRef.current !== null) {
        window.clearTimeout(armTimerRef.current);
        armTimerRef.current = null;
      }
      longPressRef.current = null;
      setArmedSide(null);
    };

    const beginPinch = () => {
      if (pinchGestureRef.current) return true;

      const pinch = beginPinchGesture(activePointersRef.current);
      if (!pinch) return false;

      pinchGestureRef.current = pinch.gesture;
      onPinchStart?.(pinch.metrics.centerX, pinch.metrics.centerY);
      return true;
    };

    const resetPointerState = (pointerId: number) => {
      try {
        overlay.releasePointerCapture(pointerId);
      } catch {}
      activePointersRef.current.delete(pointerId);
      activePointerRef.current = null;
      startPosRef.current = null;
      isDraggingRef.current = false;
      dragDirectionRef.current = null;
      clearLongPress();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (interactionLocked) {
        e.preventDefault();
        return;
      }
      // Ignore non-primary mouse buttons and context-click (e.g., Ctrl+Click on macOS)
      if (e.pointerType === 'mouse') {
        // button: 0=primary, 1=middle, 2=right
        if (e.button !== 0 || e.ctrlKey) return;
      }
      // Only track within overlay (UI above intercepts automatically)
      if (e.pointerType === 'touch') {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      try {
        overlay.setPointerCapture(e.pointerId);
      } catch {}

      if (activePointersRef.current.size >= 2) {
        e.preventDefault();
        multiTouchRef.current = true;
        onContextMenuCancelRequest?.();
        clearLongPress();
        beginPinch();
        activePointerRef.current = null;
        isDraggingRef.current = false;
        dragDirectionRef.current = null;
        startPosRef.current = null;
        return;
      }
      activePointerRef.current = e.pointerId;
      startPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      isDraggingRef.current = false;
      lastDragXRef.current = e.clientX;
      lastDragYRef.current = e.clientY;
      dragDirectionRef.current = null;

      clearLongPress();
      if (!isZoomed && (onLeftZoneLongPress || onRightZoneLongPress)) {
        const rect = overlay.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const leftEnd = rect.width * 0.2;
        const rightStart = rect.width * 0.8;
        const longPressCallback =
          x < leftEnd ? onLeftZoneLongPress : x >= rightStart ? onRightZoneLongPress : undefined;
        if (longPressCallback) {
          const side: 'left' | 'right' = x < leftEnd ? 'left' : 'right';
          const state = {
            pointerId: e.pointerId,
            side,
            callback: longPressCallback,
            armed: false,
          };
          longPressRef.current = state;
          armTimerRef.current = window.setTimeout(() => {
            armTimerRef.current = null;
            if (longPressRef.current === state) {
              state.armed = true;
              setArmedSide(state.side);
              onContextMenuCancelRequest?.();
            }
          }, LONG_PRESS_ARM_DELAY);
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (interactionLocked) {
        e.preventDefault();
        return;
      }
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (multiTouchRef.current || activePointersRef.current.size >= 2) {
        if (!beginPinch() || !pinchGestureRef.current || !onPinchZoom) return;
        const pinchMetrics = updatePinchGesture(pinchGestureRef.current, activePointersRef.current);
        if (!pinchMetrics) return;

        e.preventDefault();
        onPinchZoom(pinchMetrics.centerX, pinchMetrics.centerY, pinchMetrics.scaleMultiplier);
        return;
      }

      if (activePointerRef.current !== e.pointerId || !startPosRef.current) return;
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (
        longPressRef.current?.pointerId === e.pointerId &&
        (absDeltaX > TAP_THRESHOLD || absDeltaY > TAP_THRESHOLD)
      ) {
        clearLongPress();
      }

      if (
        e.altKey &&
        onAltDragStart &&
        (absDeltaX > DIRECTION_LOCK_THRESHOLD || absDeltaY > DIRECTION_LOCK_THRESHOLD)
      ) {
        const consumed = onAltDragStart({ x: e.clientX, y: e.clientY });
        if (consumed) {
          e.preventDefault();
          e.stopPropagation();
          onContextMenuCancelRequest?.();
          resetPointerState(e.pointerId);
          return;
        }
      }

      if (isZoomed) {
        if (
          !isDraggingRef.current &&
          (absDeltaX > DIRECTION_LOCK_THRESHOLD || absDeltaY > DIRECTION_LOCK_THRESHOLD)
        ) {
          isDraggingRef.current = true;
          onContextMenuCancelRequest?.();
          clearLongPress();
        }

        if (isDraggingRef.current && onZoomPan) {
          e.preventDefault();
          const dragDeltaX = e.clientX - lastDragXRef.current;
          const dragDeltaY = e.clientY - lastDragYRef.current;
          lastDragXRef.current = e.clientX;
          lastDragYRef.current = e.clientY;
          onZoomPan(dragDeltaX, dragDeltaY);
        }
        return;
      }

      if (disableDrag) return;

      if (
        !isDraggingRef.current &&
        (absDeltaX > DIRECTION_LOCK_THRESHOLD || absDeltaY > DIRECTION_LOCK_THRESHOLD)
      ) {
        isDraggingRef.current = true;
        onContextMenuCancelRequest?.();
        clearLongPress();
        dragDirectionRef.current = absDeltaX > absDeltaY ? 'horizontal' : 'vertical';
      }

      if (isDraggingRef.current) {
        // prevent native scroll while dragging
        try {
          e.preventDefault();
        } catch {}
        if (dragDirectionRef.current === 'horizontal' && onDrag) {
          const dragDelta = e.clientX - lastDragXRef.current;
          lastDragXRef.current = e.clientX;
          onDrag(dragDelta);
        } else if (dragDirectionRef.current === 'vertical' && onVerticalDrag) {
          const dragDelta = e.clientY - lastDragYRef.current;
          lastDragYRef.current = e.clientY;
          const rect = overlay.getBoundingClientRect();
          const progress = Math.min(
            1,
            Math.max(0, (e.clientY - startPosRef.current.y) / (rect.bottom - startPosRef.current.y))
          );
          onVerticalDrag(dragDelta, progress);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (interactionLocked) return;
      const longPress = longPressRef.current;
      if (longPress && longPress.pointerId === e.pointerId) {
        const { armed, callback } = longPress;
        clearLongPress();
        if (armed && e.type === 'pointerup') {
          resetPointerState(e.pointerId);
          callback();
          return;
        }
      }
      const wasMultiTouch = multiTouchRef.current;
      const endedPinch = pinchGestureRef.current;
      const endedTrackedPointer = endedPinch
        ? includesPinchPointer(endedPinch, e.pointerId)
        : false;
      activePointersRef.current.delete(e.pointerId);

      if (wasMultiTouch) {
        try {
          overlay.releasePointerCapture(e.pointerId);
        } catch {}
        if (endedTrackedPointer) {
          pinchGestureRef.current = null;
          onPinchEnd?.();
          beginPinch();
        }
        if (activePointersRef.current.size < 2) {
          pinchGestureRef.current = null;
          activePointerRef.current = null;
          startPosRef.current = null;
          isDraggingRef.current = false;
          dragDirectionRef.current = null;
        }
        if (activePointersRef.current.size === 0) {
          multiTouchRef.current = false;
        }
        return;
      }

      if (activePointersRef.current.size === 0) {
        multiTouchRef.current = false;
      }
      if (activePointerRef.current !== e.pointerId || !startPosRef.current) return;
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      const deltaTime = Date.now() - startPosRef.current.time;

      if (isDraggingRef.current) {
        if (dragDirectionRef.current === 'horizontal' && onDragEnd) {
          const velocity = deltaX / (deltaTime / 1000);
          onDragEnd(deltaX, velocity);
        } else if (dragDirectionRef.current === 'vertical' && onVerticalDragEnd) {
          const velocity = deltaY / (deltaTime / 1000);
          const rect = overlay.getBoundingClientRect();
          const progress = Math.min(
            1,
            Math.max(0, (e.clientY - startPosRef.current.y) / (rect.bottom - startPosRef.current.y))
          );
          onVerticalDragEnd(deltaY, velocity, progress);
        }
      } else if (
        Math.abs(deltaX) < TAP_THRESHOLD &&
        Math.abs(deltaY) < TAP_THRESHOLD &&
        deltaTime < TAP_TIME_THRESHOLD
      ) {
        if (isZoomed) {
          const previousTap = lastZoomTapRef.current;
          const now = Date.now();
          const isDoubleTap =
            previousTap &&
            now - previousTap.time <= DOUBLE_TAP_TIME_THRESHOLD &&
            Math.hypot(e.clientX - previousTap.x, e.clientY - previousTap.y) <=
              DOUBLE_TAP_DISTANCE_THRESHOLD;

          if (isDoubleTap) {
            lastZoomTapRef.current = null;
            onDoubleTap?.();
          } else {
            lastZoomTapRef.current = { x: e.clientX, y: e.clientY, time: now };
          }

          try {
            overlay.releasePointerCapture(e.pointerId);
          } catch {}
          activePointerRef.current = null;
          startPosRef.current = null;
          isDraggingRef.current = false;
          dragDirectionRef.current = null;
          return;
        }

        lastZoomTapRef.current = null;
        // Tap within overlay: left/right 20% zones
        const rect = overlay.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const leftEnd = rect.width * 0.2; // 20%
        const rightStart = rect.width * 0.8; // 80%
        if (x < leftEnd) onLeftTap();
        else if (x >= rightStart) onRightTap();
        else if (onCenterTap) onCenterTap();
      }

      // Release capture if we captured on down
      try {
        overlay.releasePointerCapture(e.pointerId);
      } catch {}
      activePointerRef.current = null;
      startPosRef.current = null;
      isDraggingRef.current = false;
      dragDirectionRef.current = null;
    };

    const handleLostPointerCapture = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      handlePointerUp(e);
    };

    const handleWheel = (e: WheelEvent) => {
      if (interactionLocked) {
        e.preventDefault();
        return;
      }
      if (!onWheelZoom) return;
      e.preventDefault();
      onWheelZoom(e.clientX, e.clientY, e.deltaY);
    };

    overlay.addEventListener('pointerdown', handlePointerDown, { passive: false });
    overlay.addEventListener('pointermove', handlePointerMove, { passive: false });
    overlay.addEventListener('pointerup', handlePointerUp, { passive: true });
    overlay.addEventListener('pointercancel', handlePointerUp, { passive: true });
    overlay.addEventListener('lostpointercapture', handleLostPointerCapture, { passive: true });
    overlay.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      overlay.removeEventListener('pointerdown', handlePointerDown);
      overlay.removeEventListener('pointermove', handlePointerMove);
      overlay.removeEventListener('pointerup', handlePointerUp);
      overlay.removeEventListener('pointercancel', handlePointerUp);
      overlay.removeEventListener('lostpointercapture', handleLostPointerCapture);
      overlay.removeEventListener('wheel', handleWheel);
      clearLongPress();
    };
  }, [
    enabled,
    disableDrag,
    isZoomed,
    interactionLocked,
    onLeftTap,
    onRightTap,
    onCenterTap,
    onDrag,
    onDragEnd,
    onVerticalDrag,
    onVerticalDragEnd,
    onWheelZoom,
    onPinchStart,
    onPinchZoom,
    onPinchEnd,
    onZoomPan,
    onDoubleTap,
    onLeftZoneLongPress,
    onRightZoneLongPress,
    onAltDragStart,
    onContextMenuCancelRequest,
  ]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed group"
        style={{
          zIndex: 10,
          left: `${contentArea.left}px`,
          right: `${contentArea.right}px`,
          top: `${contentArea.top}px`,
          bottom: 0,
          background: 'transparent',
          pointerEvents: 'none',
        }}
      >
        {/* Interaction layer: excludes bottom safe area and accepts pointer events */}
        <div
          ref={interactionRef}
          className="absolute"
          style={{
            left: 0,
            right: 0,
            top: 0,
            bottom: `${contentArea.bottom}px`,
            pointerEvents: 'auto',
            touchAction: 'none',
            overscrollBehavior: 'contain',
          }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-[20%] cursor-pointer" />
          <div className="absolute right-0 top-0 bottom-0 w-[20%] cursor-pointer" />
        </div>
      </div>
      {/* Full-height arm feedback: spans the whole screen height, independent of the bottom safe area */}
      {armedSide && (
        <div
          className="fixed"
          style={{
            zIndex: 10,
            left: `${contentArea.left}px`,
            right: `${contentArea.right}px`,
            top: 0,
            bottom: 0,
            pointerEvents: 'none',
          }}
        >
          <LongPressArmIndicator side={armedSide} />
        </div>
      )}
    </>
  );
}
