import { selectionModeAtom } from '@/stores/ui';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';

export function useSelectionMode(isSelectionMode: boolean) {
  const [, setSelectionMode] = useAtom(selectionModeAtom);
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);

  // Handle selection mode changes
  useEffect(() => {
    if (!isSelectionMode) {
      setSelectedItems(new Set());
      setIsEditPanelOpen(false);
    }
    // Do not auto-open the edit panel when entering selection mode;
    // it will be opened from the action bar's Edit button.
  }, [isSelectionMode]);

  const toggleItemSelection = (itemId: string | number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
  };

  return {
    selectedItems,
    setSelectedItems,
    isEditPanelOpen,
    setIsEditPanelOpen,
    toggleItemSelection,
    clearSelection,
    exitSelectionMode,
  };
}
