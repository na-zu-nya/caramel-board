import { useEffect, useRef, useState } from 'react';

interface TapZoneOverlayProps {
  onLeftTap: () => void;
  onRightTap: () => void;
  onCenterTap?: () => void;
  onDrag?: (deltaX: number) => void;
  onDragEnd?: (deltaX: number, velocity: number) => void;
  onVerticalDrag?: (deltaY: number, progress: number) => void;
  onVerticalDragEnd?: (deltaY: number, velocity: number, progress: number) => void;
  enabled?: boolean;
  contentArea?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  disableDrag?: boolean;
  canGoLeft?: boolean;
  canGoRight?: boolean;
}

export default function TapZoneOverlay({
  onLeftTap,
  onRightTap,
  onCenterTap,
  onDrag,
  onDragEnd,
  onVerticalDrag,
  onVerticalDragEnd,
  enabled = true,
  contentArea = { top: 0, left: 0, right: 0, bottom: 0 },
  disableDrag = false,
  canGoLeft = true,
  canGoRight = true,
}: TapZoneOverlayProps) {
  const [leftHover, setLeftHover] = useState(false);
  const [rightHover, setRightHover] = useState(false);
  const startPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const activePointersRef = useRef<Set<number>>(new Set());
  const multiTouchRef = useRef(false);

  const TAP_THRESHOLD = 10; // pixels
  const TAP_TIME_THRESHOLD = 300; // milliseconds
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
      activePointersRef.current.add(e.pointerId);
      // If two or more fingers: cancel any in-progress drag and allow native pinch
      if (activePointersRef.current.size >= 2) {
        multiTouchRef.current = true;
        // release any capture to not block pinch
        try {
          overlay.releasePointerCapture(e.pointerId);
        } catch {}
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
      // For single-finger interactions (disableDrag=false), capture pointer to keep consistent tracking
      if (!disableDrag) {
        overlay.setPointerCapture(e.pointerId);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (disableDrag) return;
      if (multiTouchRef.current || activePointersRef.current.size >= 2) return;
      if (activePointerRef.current !== e.pointerId || !startPosRef.current) return;
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (
        !isDraggingRef.current &&
        (absDeltaX > DIRECTION_LOCK_THRESHOLD || absDeltaY > DIRECTION_LOCK_THRESHOLD)
      ) {
        isDraggingRef.current = true;
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
      activePointersRef.current.delete(e.pointerId);
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
        if (!disableDrag) overlay.releasePointerCapture(e.pointerId);
      } catch {}
      activePointerRef.current = null;
      startPosRef.current = null;
      isDraggingRef.current = false;
      dragDirectionRef.current = null;
    };

    overlay.addEventListener('pointerdown', handlePointerDown as any, { passive: false });
    overlay.addEventListener('pointermove', handlePointerMove as any, { passive: false });
    overlay.addEventListener('pointerup', handlePointerUp as any, { passive: true });
    overlay.addEventListener('pointercancel', handlePointerUp as any, { passive: true });

    return () => {
      overlay.removeEventListener('pointerdown', handlePointerDown as any);
      overlay.removeEventListener('pointermove', handlePointerMove as any);
      overlay.removeEventListener('pointerup', handlePointerUp as any);
      overlay.removeEventListener('pointercancel', handlePointerUp as any);
    };
  }, [
    enabled,
    disableDrag,
    onLeftTap,
    onRightTap,
    onCenterTap,
    onDrag,
    onDragEnd,
    onVerticalDrag,
    onVerticalDragEnd,
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
          touchAction: (disableDrag ? 'auto' : 'none') as any,
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
