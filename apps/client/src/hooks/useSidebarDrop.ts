import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useDrag } from '@/contexts/DragContext';
import { extractStackIdsFromDragPayload, hasStackDragPayload } from '@/lib/stack-drag-data';

export interface UseSidebarDropOptions {
  acceptDrop?: boolean;
  onDrop?: (stackIds: number[]) => Promise<void> | void;
}

export function useSidebarDrop({ acceptDrop = true, onDrop }: UseSidebarDropOptions) {
  const { draggedStack, dragKind, isDragging } = useDrag();
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback<React.DragEventHandler>(
    (e) => {
      if (!acceptDrop || !onDrop) return;
      if (!hasStackDragPayload(e.dataTransfer, draggedStack?.stackId)) {
        setIsDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try {
        // Chrome 向け: copy を明示しないと effectAllowed=copyMove のドロップが無効になる
        e.dataTransfer.dropEffect = 'copy';
      } catch {}
      setIsDragOver(true);
    },
    [acceptDrop, draggedStack?.stackId, onDrop]
  );

  const handleDragLeave = useCallback<React.DragEventHandler>(
    (e) => {
      if (!hasStackDragPayload(e.dataTransfer, draggedStack?.stackId)) {
        setIsDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    [draggedStack?.stackId]
  );

  const handleDrop = useCallback<React.DragEventHandler>(
    async (e) => {
      if (!hasStackDragPayload(e.dataTransfer, draggedStack?.stackId)) {
        setIsDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!acceptDrop || !onDrop) return;

      const stackIds = extractStackIdsFromDragPayload(e.dataTransfer, draggedStack?.stackId);
      if (stackIds.length === 0) return;

      await onDrop?.(stackIds);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['collection-stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
        queryClient.invalidateQueries({ queryKey: ['collections'] }),
        queryClient.invalidateQueries({ queryKey: ['collection-folders'] }),
      ]);
    },
    [acceptDrop, draggedStack?.stackId, onDrop, queryClient]
  );

  const showDropIndicator = !!(
    acceptDrop &&
    onDrop &&
    isDragging &&
    (dragKind === 'stack' || dragKind === 'native-image') &&
    isDragOver
  );

  return {
    isDragOver,
    showDropIndicator,
    containerProps: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    } as React.HTMLAttributes<HTMLDivElement>,
  };
}
