import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useDrag } from '@/contexts/DragContext';
import { extractStackIdsFromDataTransfer, hasStackDragDataTransfer } from '@/lib/stack-drag-data';

export interface UseSidebarDropOptions {
  acceptDrop?: boolean;
  onDrop?: (stackIds: number[]) => Promise<void> | void;
}

export function useSidebarDrop({ acceptDrop = true, onDrop }: UseSidebarDropOptions) {
  const { dragKind, isDragging } = useDrag();
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback<React.DragEventHandler>(
    (e) => {
      if (!acceptDrop || !onDrop) return;
      if (dragKind === 'native-image' || !hasStackDragDataTransfer(e.dataTransfer)) {
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
    [acceptDrop, dragKind, onDrop]
  );

  const handleDragLeave = useCallback<React.DragEventHandler>(
    (e) => {
      if (dragKind === 'native-image' || !hasStackDragDataTransfer(e.dataTransfer)) {
        setIsDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    [dragKind]
  );

  const handleDrop = useCallback<React.DragEventHandler>(
    async (e) => {
      if (dragKind === 'native-image' || !hasStackDragDataTransfer(e.dataTransfer)) {
        setIsDragOver(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!acceptDrop || !onDrop) return;

      const stackIds = extractStackIdsFromDataTransfer(e.dataTransfer);
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
    [acceptDrop, dragKind, onDrop, queryClient]
  );

  const showDropIndicator = !!(
    acceptDrop &&
    onDrop &&
    isDragging &&
    dragKind === 'stack' &&
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
