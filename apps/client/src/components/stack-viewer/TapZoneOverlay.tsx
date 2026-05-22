import { useEffect, useRef, useState } from 'react';

interface TapZoneOverlayProps {
  onLeftTap: () => void;
  onRightTap: () => void;
  onCenterTap?: () => void;
  onDrag?: (deltaX: number) => void;
  onDragEnd?: (deltaX: number, velocity: number) => void;
  onVerticalDrag?: (deltaY: number, progress: number) => void;
  onVerticalDragEnd?: (deltaY: number, velocity: number, progress: number) => void;
  onWheelZoom?: (clientX: number, clientY: number, deltaY: number) => void;
  onPinchStart?: (clientX?: number, clientY?: number) => void;
  onPinchZoom?: (clientX: number, clientY: number, scaleMultiplier: number) => void;
  onPinchEnd?: () => void;
  onZoomPan?: (deltaX: number, deltaY: number) => void;
  onDoubleTap?: () => void;
  onContextMenuCancelRequest?: () => void;
  enabled?: boolean;
  contentArea?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  disableDrag?: boolean;
  isZoomed?: boolean;
  canGoLeft?: boolean;
  canGoRight?: boolean;
}

interface PointerPosition {
  x: number;
  y: number;
}

const getPinchMetrics = (pointers: Map<number, PointerPosition>) => {
  const points = Array.from(pointers.values());
  if (points.length < 2) return null;

  const [first, second] = points;
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;

  return {
    distance: Math.hypot(deltaX, deltaY),
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
  };
};

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
  onContextMenuCancelRequest,
  enabled = true,
  contentArea = { top: 0, left: 0, right: 0, bottom: 0 },
  disableDrag = false,
  isZoomed = false,
  canGoLeft = true,
  canGoRight = true,
}: TapZoneOverlayProps) {
  const [leftHover, setLeftHover] = useState(false);
  const [rightHover, setRightHover] = useState(false);
  const startPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const activePointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const multiTouchRef = useRef(false);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchLastDistanceRef = useRef<number | null>(null);
  const lastZoomTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const TAP_THRESHOLD = 10; // pixels
  const TAP_TIME_THRESHOLD = 300; // milliseconds
  const DOUBLE_TAP_TIME_THRESHOLD = 320; // milliseconds
  const DOUBLE_TAP_DISTANCE_THRESHOLD = 32; // pixels
  const DIRECTION_LOCK_THRESHOLD = 6; // pixels - quicker direction lock on touch
  const isDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);
  const lastDragYRef = useRef(0);
  const activePointerRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);

  // Pointer handlers bound to interaction layer (excludes bottom safe area)
  useEffect(() => {
    const overlay = interactionRef.current;
    if (!enabled || !overlay) return;

    const handlePointerDown = (e: PointerEvent) => {
      // Ignore non-primary mouse buttons and context-click (e.g., Ctrl+Click on macOS)
      if (e.pointerType === 'mouse') {
        // button: 0=primary, 1=middle, 2=right
        if (e.button !== 0 || e.ctrlKey) return;
      }
      // Only track within overlay (UI above intercepts automatically)
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        overlay.setPointerCapture(e.pointerId);
      } catch {}

      if (activePointersRef.current.size >= 2) {
        e.preventDefault();
        multiTouchRef.current = true;
        onContextMenuCancelRequest?.();
        pinchStartDistanceRef.current = null;
        pinchLastDistanceRef.current = null;
        onPinchStart?.();
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
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (multiTouchRef.current || activePointersRef.current.size >= 2) {
        const pinchMetrics = getPinchMetrics(activePointersRef.current);
        if (!pinchMetrics || !onPinchZoom) return;
        if (!Number.isFinite(pinchMetrics.distance) || pinchMetrics.distance <= 0) return;

        const startDistance = pinchStartDistanceRef.current;
        if (!startDistance || startDistance <= 0) {
          pinchStartDistanceRef.current = pinchMetrics.distance;
          pinchLastDistanceRef.current = pinchMetrics.distance;
          onPinchStart?.(pinchMetrics.centerX, pinchMetrics.centerY);
          return;
        }

        const lastDistance = pinchLastDistanceRef.current;
        if (lastDistance && lastDistance > 0) {
          const frameRatio = pinchMetrics.distance / lastDistance;
          if (!Number.isFinite(frameRatio) || frameRatio > 2.5 || frameRatio < 0.4) {
            pinchStartDistanceRef.current = pinchMetrics.distance;
            pinchLastDistanceRef.current = pinchMetrics.distance;
            onPinchStart?.(pinchMetrics.centerX, pinchMetrics.centerY);
            return;
          }
        }

        pinchLastDistanceRef.current = pinchMetrics.distance;
        const scaleMultiplier = pinchMetrics.distance / startDistance;
        if (!Number.isFinite(scaleMultiplier) || scaleMultiplier <= 0) return;

        e.preventDefault();
        onPinchZoom(pinchMetrics.centerX, pinchMetrics.centerY, scaleMultiplier);
        return;
      }

      if (activePointerRef.current !== e.pointerId || !startPosRef.current) return;
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (isZoomed) {
        if (
          !isDraggingRef.current &&
          (absDeltaX > DIRECTION_LOCK_THRESHOLD || absDeltaY > DIRECTION_LOCK_THRESHOLD)
        ) {
          isDraggingRef.current = true;
          onContextMenuCancelRequest?.();
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
      const wasMultiTouch = multiTouchRef.current;
      activePointersRef.current.delete(e.pointerId);

      if (wasMultiTouch) {
        try {
          overlay.releasePointerCapture(e.pointerId);
        } catch {}
        if (activePointersRef.current.size < 2) {
          if (pinchStartDistanceRef.current !== null) {
            onPinchEnd?.();
          }
          pinchStartDistanceRef.current = null;
          pinchLastDistanceRef.current = null;
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

    const handleWheel = (e: WheelEvent) => {
      if (!onWheelZoom) return;
      e.preventDefault();
      onWheelZoom(e.clientX, e.clientY, e.deltaY);
    };

    overlay.addEventListener('pointerdown', handlePointerDown, { passive: false });
    overlay.addEventListener('pointermove', handlePointerMove, { passive: false });
    overlay.addEventListener('pointerup', handlePointerUp, { passive: true });
    overlay.addEventListener('pointercancel', handlePointerUp, { passive: true });
    overlay.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      overlay.removeEventListener('pointerdown', handlePointerDown);
      overlay.removeEventListener('pointermove', handlePointerMove);
      overlay.removeEventListener('pointerup', handlePointerUp);
      overlay.removeEventListener('pointercancel', handlePointerUp);
      overlay.removeEventListener('wheel', handleWheel);
    };
  }, [
    enabled,
    disableDrag,
    isZoomed,
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
    onContextMenuCancelRequest,
  ]);

  if (!enabled) return null;

  return (
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
      {/* Visual gradients (full height). Hidden when cannot navigate further. */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[20%] pointer-events-none transition-opacity duration-150"
        style={{
          opacity: leftHover && canGoLeft ? 1 : 0,
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklch, var(--primary) 12%, transparent), transparent)',
        }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-[20%] pointer-events-none transition-opacity duration-150"
        style={{
          opacity: rightHover && canGoRight ? 1 : 0,
          backgroundImage:
            'linear-gradient(to left, color-mix(in oklch, var(--primary) 12%, transparent), transparent)',
        }}
      />
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
        {/* 左20%ゾーン（hoverトリガーのみ） */}
        <div className="absolute left-0 top-0 bottom-0 w-[20%] cursor-pointer">
          {/* hoverトリガー領域 */}
          <div
            className="absolute left-0 right-0 top-0 bottom-0"
            onMouseEnter={() => setLeftHover(true)}
            onMouseLeave={() => setLeftHover(false)}
          />
        </div>

        {/* 右20%ゾーン（hoverトリガーのみ） */}
        <div className="absolute right-0 top-0 bottom-0 w-[20%] cursor-pointer">
          <div
            className="absolute left-0 right-0 top-0 bottom-0"
            onMouseEnter={() => setRightHover(true)}
            onMouseLeave={() => setRightHover(false)}
          />
        </div>
      </div>
    </div>
  );
}
