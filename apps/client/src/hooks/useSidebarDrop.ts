import { useDrag } from '@/contexts/DragContext';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export interface UseSidebarDropOptions {
  acceptDrop?: boolean;
  onDrop?: (stackIds: number[]) => Promise<void> | void;
}

export function useSidebarDrop({ acceptDrop = true, onDrop }: UseSidebarDropOptions) {
  const { isDragging } = useDrag();
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback<React.DragEventHandler>((e) => {
    if (!acceptDrop || !onDrop) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      // Chrome 向け: copy を明示しないと effectAllowed=copyMove のドロップが無効になる
      e.dataTransfer.dropEffect = 'copy';
    } catch {}
    setIsDragOver(true);
  }, [acceptDrop, onDrop]);

  const handleDragLeave = useCallback<React.DragEventHandler>((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback<React.DragEventHandler>(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!acceptDrop || !onDrop) return;

    const dragData = e.dataTransfer.getData('text/plain');
    let stackIds: number[] = [];
    if (dragData.startsWith('stack-items:')) {
      stackIds = dragData.replace('stack-items:', '').split(',').map(Number).filter(Boolean);
    } else if (dragData.startsWith('stack-item:')) {
      const stackId = Number(dragData.replace('stack-item:', ''));
      if (stackId) stackIds = [stackId];
    } else {
      const stackId = Number(dragData);
      if (stackId) stackIds = [stackId];
    }
    if (stackIds.length === 0) return;

    await onDrop?.(stackIds);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['collection-stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
      queryClient.invalidateQueries({ queryKey: ['collections'] }),
      queryClient.invalidateQueries({ queryKey: ['collection-folders'] }),
    ]);
  }, [acceptDrop, onDrop, queryClient]);

  const showDropIndicator = !!(acceptDrop && onDrop && isDragging && isDragOver);

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
