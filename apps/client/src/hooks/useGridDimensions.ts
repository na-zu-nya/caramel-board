import { useCallback, useState } from 'react';

export function useGridDimensions() {
  const [itemSize, setItemSize] = useState(200); // Default item size in pixels
  const [columnsPerRow, setColumnsPerRow] = useState(5);

  const calculateGridDimensions = useCallback(
    (
      sidebarOpen: boolean,
      infoSidebarOpen: boolean,
      isSelectionMode: boolean,
      isAnimating = false
    ) => {
      if (isAnimating) {
        return;
      }
      console.log('update calculateGridDimensions');

      // Use full viewport width for consistent column calculation
      // regardless of sidebar/panel states
      const fullViewportWidth = window.innerWidth;

      // Calculate item size based on full viewport width
      // min(20vw, 12em) ≈ min(20% of viewport, 192px at 16px base)
      const minItemSize = Math.min(fullViewportWidth * 0.2, 192);
      const calculatedColumns = Math.floor(fullViewportWidth / minItemSize);

      // Calculate actual item size based on current container width
      // but maintain the column count from full viewport
      const containerWidth =
        fullViewportWidth -
        (sidebarOpen ? 320 : 0) -
        (infoSidebarOpen || isSelectionMode ? 320 : 0);
      const actualItemSize = containerWidth / calculatedColumns;

      setItemSize(actualItemSize);
      setColumnsPerRow(calculatedColumns);
    },
    []
  );

  return {
    itemSize,
    columnsPerRow,
    calculateGridDimensions,
  };
}
