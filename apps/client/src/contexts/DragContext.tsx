import { useDisableTextSelection } from '@/hooks/useDisableTextSelection';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

interface DraggedStackInfo {
  stackId: number;
  collectionIds: number[];
}

interface DragContextType {
  draggedStack: DraggedStackInfo | null;
  setDraggedStack: (stack: DraggedStackInfo | null) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

const DragContext = createContext<DragContextType | undefined>(undefined);

export function DragProvider({ children }: { children: ReactNode }) {
  const [draggedStack, setDraggedStack] = useState<DraggedStackInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { setDragging } = useDisableTextSelection();

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
        setIsDragging,
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
