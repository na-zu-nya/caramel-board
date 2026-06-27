import { useCallback, useState } from 'react';
import { useRightPanelLayoutMode, useSidebarLayoutMode } from './useSidebarLayoutMode';

export function useGridDimensions() {
  const { isFloating: sidebarIsFloating } = useSidebarLayoutMode();
  const { isFloating: rightPanelIsFloating } = useRightPanelLayoutMode();
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
        (sidebarOpen && !sidebarIsFloating ? 320 : 0) -
        ((infoSidebarOpen || isSelectionMode) && !rightPanelIsFloating ? 320 : 0);
      const actualItemSize = containerWidth / calculatedColumns;

      setItemSize(actualItemSize);
      setColumnsPerRow(calculatedColumns);
    },
    [rightPanelIsFloating, sidebarIsFloating]
  );

  return {
    itemSize,
    columnsPerRow,
    calculateGridDimensions,
  };
}
