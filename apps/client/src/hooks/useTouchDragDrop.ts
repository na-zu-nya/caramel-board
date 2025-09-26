import { useCallback, useRef, useState } from 'react';

// Global variable to store touch drag data (more reliable than sessionStorage)
const globalTouchDragData: any = null;

interface TouchDragDropOptions {
  onDragStart?: (data: any) => void;
  onDragEnd?: () => void;
  dragData?: any;
  disabled?: boolean;
  dragPreviewElement?: () => HTMLElement;
}

interface TouchDropZoneOptions {
  onDrop?: (data: any) => void;
  canDrop?: (data: any) => boolean;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
}

export function useTouchDragDrop(options: TouchDragDropOptions) {
  const { onDragStart, onDragEnd, dragData, disabled, dragPreviewElement } = options;
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragPreview = useRef<HTMLElement | null>(null);
  const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const hasMoved = useRef(false);

  // Global touchmove handler to prevent all scrolling during drag
  const globalTouchMoveHandler = useCallback((e: TouchEvent) => {
    if (isDraggingRef.current) {
      console.log('🟡 Global touchmove - preventing scroll');
      e.preventDefault();
      // Don't stop propagation to allow drop zone detection
    }
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;

      console.log('🟢 Touch start - storing drag data:', dragData);
      const touch = e.touches[0];
      dragStartPos.current = { x: touch.clientX, y: touch.clientY };
      hasMoved.current = false;

      // Start drag detection timer
      dragTimeoutRef.current = setTimeout(() => {
        // Only start drag if finger hasn't moved
        if (!hasMoved.current) {
          console.log('🟢 Touch drag started after 700ms without movement');
          setIsDragging(true);
          isDraggingRef.current = true;
          onDragStart?.(dragData);

          // Disable body scroll during drag
          document.body.style.overflow = 'hidden';
          document.body.style.touchAction = 'none';

          // Prevent text selection during touch drag
          document.body.style.webkitUserSelect = 'none';
          document.body.style.userSelect = 'none';

          // Add global touchmove listener to prevent all scrolling
          document.addEventListener('touchmove', globalTouchMoveHandler, { passive: false });
          console.log('🟢 Global touchmove listener added');

          // Create drag preview
          if (dragPreviewElement) {
            const preview = dragPreviewElement();
            preview.style.cssText += `
            position: fixed;
            pointer-events: none;
            z-index: 10000;
            left: ${touch.clientX - 40}px;
            top: ${touch.clientY - 40}px;
            opacity: 0.9;
            transform: scale(1.05);
            transition: none;
          `;
            document.body.appendChild(preview);
            dragPreview.current = preview;
          }
        }
      }, 700); // 700ms delay as requested
    },
    [disabled, onDragStart, dragData, dragPreviewElement, globalTouchMoveHandler]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];

      // If drag hasn't started yet, check for movement
      if (!isDragging && dragTimeoutRef.current && dragStartPos.current) {
        const moveThreshold = 10; // pixels
        const deltaX = Math.abs(touch.clientX - dragStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - dragStartPos.current.y);

        if (deltaX > moveThreshold || deltaY > moveThreshold) {
          // Movement detected - cancel drag timer
          console.log('🟨 Movement detected during delay - canceling drag');
          hasMoved.current = true;
          clearTimeout(dragTimeoutRef.current);
          dragTimeoutRef.current = null;
          return;
        }
      }

      // If dragging, update preview position
      if (isDragging && dragPreview.current) {
        e.preventDefault(); // Prevent scrolling only during actual drag
        // Update drag preview position
        dragPreview.current.style.left = `${touch.clientX - 40}px`;
        dragPreview.current.style.top = `${touch.clientY - 40}px`;
      }
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    console.log('🔴 Touch end, isDragging:', isDragging);

    // Clear drag detection timer if drag didn't start
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }

    if (isDragging) {
      console.log('🔴 Ending touch drag');
      setIsDragging(false);
      isDraggingRef.current = false;
      onDragEnd?.();

      // Re-enable body scroll and text selection
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.userSelect = '';

      // Remove drag preview
      if (dragPreview.current) {
        document.body.removeChild(dragPreview.current);
        dragPreview.current = null;
      }
    } else {
      // Even if not dragging, ensure ref is reset
      isDraggingRef.current = false;
    }

    // Always remove global touchmove listener on touch end
    document.removeEventListener('touchmove', globalTouchMoveHandler);
    console.log('🔴 Global touchmove listener removed');

    dragStartPos.current = null;
  }, [isDragging, onDragEnd, globalTouchMoveHandler]);

  const handleTouchCancel = useCallback(() => {
    handleTouchEnd();
  }, [handleTouchEnd]);

  return {
    isDragging,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
  };
}

export function useTouchDropZone(options: TouchDropZoneOptions) {
  const { onDrop, canDrop, onDragEnter, onDragLeave } = options;
  const [isDragOver, setIsDragOver] = useState(false);
  const dropZoneRef = useRef<HTMLElement | null>(null);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      // Only process touch move if there's touch drag data (indicating active drag)
      if (!(window as any).globalTouchDragData || !e.touches.length) return;

      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);

      if (dropZoneRef.current && dropZoneRef.current.contains(element as Node)) {
        if (!isDragOver) {
          console.log('🟦 Touch drag enter drop zone');
          setIsDragOver(true);
          onDragEnter?.();
        }
      } else {
        if (isDragOver) {
          console.log('🟨 Touch drag leave drop zone');
          setIsDragOver(false);
          onDragLeave?.();
        }
      }
    },
    [isDragOver, onDragEnter, onDragLeave]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      console.log('🟦 Touch end in drop zone, isDragOver:', isDragOver);
      console.log('🟦 Changed touches length:', e.changedTouches.length);
      console.log(
        '🟦 Global drag data:',
        (window as any).globalTouchDragData ? 'EXISTS' : 'NOT FOUND'
      );

      if (!(window as any).globalTouchDragData || !e.changedTouches.length) {
        console.log(
          '🟨 No drag data or changed touches - dragData:',
          !!(window as any).globalTouchDragData,
          'touches:',
          e.changedTouches.length
        );
        // Clear drag over state even if no drag data
        if (isDragOver) {
          setIsDragOver(false);
          onDragLeave?.();
        }
        return;
      }

      const touch = e.changedTouches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);

      if (isDragOver && dropZoneRef.current && dropZoneRef.current.contains(element as Node)) {
        console.log('🟢 Processing touch drop');
        // Process drop with drag data
        if (!canDrop || canDrop((window as any).globalTouchDragData)) {
          console.log('🟢 Calling onDrop with data:', (window as any).globalTouchDragData);
          onDrop?.((window as any).globalTouchDragData);
        } else {
          console.log('🟨 Drop not allowed by canDrop');
        }
      } else {
        console.log('🟨 Not over drop zone or not dragging');
      }

      // Always clear drag over state when touch ends
      if (isDragOver) {
        setIsDragOver(false);
        onDragLeave?.();
      }
    },
    [isDragOver, onDrop, canDrop, onDragLeave]
  );

  // Set up global touch event listeners
  const setupDropZone = useCallback(
    (element: HTMLElement | null) => {
      dropZoneRef.current = element;

      if (element) {
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
      }

      return () => {
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    },
    [handleTouchMove, handleTouchEnd]
  );

  return {
    isDragOver,
    setupDropZone,
  };
}
