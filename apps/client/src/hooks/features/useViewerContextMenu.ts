import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ViewerContextMenuPosition {
  x: number;
  y: number;
}

interface UseViewerContextMenuOptions {
  longPressDelay?: number;
  moveThreshold?: number;
  menuWidth?: number;
  menuHeight?: number;
}

interface PendingPointer {
  id: number;
  x: number;
  y: number;
}

const clampPosition = (
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number
): ViewerContextMenuPosition => {
  const padding = 8;
  const maxX = Math.max(padding, window.innerWidth - menuWidth - padding);
  const maxY = Math.max(padding, window.innerHeight - menuHeight - padding);

  return {
    x: Math.min(Math.max(x, padding), maxX),
    y: Math.min(Math.max(y, padding), maxY),
  };
};

export function useViewerContextMenu({
  longPressDelay = 700,
  moveThreshold = 10,
  menuWidth = 192,
  menuHeight = 184,
}: UseViewerContextMenuOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<ViewerContextMenuPosition>({ x: 0, y: 0 });
  const longPressTimerRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<PendingPointer | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pendingPointerRef.current = null;
  }, []);

  const openAt = useCallback(
    (x: number, y: number) => {
      clearLongPress();
      setPosition(clampPosition(x, y, menuWidth, menuHeight));
      setIsOpen(true);
    },
    [clearLongPress, menuHeight, menuWidth]
  );

  const close = useCallback(() => {
    clearLongPress();
    setIsOpen(false);
  }, [clearLongPress]);

  const cancelPendingOpen = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      openAt(event.clientX, event.clientY);
    },
    [openAt]
  );

  const handlePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') return;
      if (event.button !== 0) return;

      clearLongPress();
      pendingPointerRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };

      longPressTimerRef.current = window.setTimeout(() => {
        const pendingPointer = pendingPointerRef.current;
        if (!pendingPointer) return;
        openAt(pendingPointer.x, pendingPointer.y);
      }, longPressDelay);
    },
    [clearLongPress, longPressDelay, openAt]
  );

  const handlePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pendingPointer = pendingPointerRef.current;
      if (!pendingPointer || pendingPointer.id !== event.pointerId) return;

      const deltaX = event.clientX - pendingPointer.x;
      const deltaY = event.clientY - pendingPointer.y;
      if (Math.hypot(deltaX, deltaY) > moveThreshold) {
        clearLongPress();
      }
    },
    [clearLongPress, moveThreshold]
  );

  const handlePointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pendingPointerRef.current?.id !== event.pointerId) return;
      clearLongPress();
    },
    [clearLongPress]
  );

  const handlePointerCancelCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pendingPointerRef.current?.id !== event.pointerId) return;
      clearLongPress();
    },
    [clearLongPress]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const menuElement = menuRef.current;
      if (menuElement?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => clearLongPress, [clearLongPress]);

  return {
    isOpen,
    position,
    menuRef,
    openAt,
    close,
    cancelPendingOpen,
    triggerProps: {
      onContextMenu: handleContextMenu,
      onPointerDownCapture: handlePointerDownCapture,
      onPointerMoveCapture: handlePointerMoveCapture,
      onPointerUpCapture: handlePointerUpCapture,
      onPointerCancelCapture: handlePointerCancelCapture,
    },
  };
}
