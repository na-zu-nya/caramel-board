import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useDisableTextSelection } from '@/hooks/useDisableTextSelection';

interface DraggedStackInfo {
  stackId: number | string;
  collectionIds: number[];
}

type DragKind = 'stack' | 'native-image' | null;

interface DragContextType {
  draggedStack: DraggedStackInfo | null;
  setDraggedStack: (stack: DraggedStackInfo | null) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  dragKind: DragKind;
  setDragKind: (kind: DragKind) => void;
}

const DragContext = createContext<DragContextType | undefined>(undefined);

export function DragProvider({ children }: { children: ReactNode }) {
  const [draggedStack, setDraggedStack] = useState<DraggedStackInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const { setDragging } = useDisableTextSelection();

  const setDraggingState = useCallback((dragging: boolean) => {
    setIsDragging(dragging);
    if (!dragging) {
      setDragKind(null);
      setDraggedStack(null);
      return;
    }
    setDragKind((current) => current ?? 'stack');
  }, []);

  // Update text selection state when dragging changes
  useEffect(() => {
    setDragging(isDragging);
  }, [isDragging, setDragging]);

  return (
    <DragContext.Provider
      value={{
        draggedStack,
        setDraggedStack,
        isDragging,
        setIsDragging: setDraggingState,
        dragKind,
        setDragKind,
      }}
    >
      {children}
    </DragContext.Provider>
  );
}

export function useDrag() {
  const context = useContext(DragContext);
  if (context === undefined) {
    throw new Error('useDrag must be used within a DragProvider');
  }
  return context;
}
