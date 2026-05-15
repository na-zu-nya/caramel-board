import { useAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { selectionModeAtom } from '@/stores/ui';

type SelectionItemId = string | number;

const toggleSelectionOrder = (prevOrder: SelectionItemId[], itemId: SelectionItemId) => {
  if (prevOrder.includes(itemId)) {
    return prevOrder.filter((id) => id !== itemId);
  }
  return [...prevOrder, itemId];
};

const mergeRangeIntoSelectionOrder = (
  prevOrder: SelectionItemId[],
  rangeItemIds: SelectionItemId[]
) => {
  const uniqueRangeIds: SelectionItemId[] = [];
  for (const itemId of rangeItemIds) {
    if (!uniqueRangeIds.includes(itemId)) {
      uniqueRangeIds.push(itemId);
    }
  }

  const nextOrder = prevOrder.filter((itemId) => !uniqueRangeIds.includes(itemId));
  nextOrder.push(...uniqueRangeIds);
  return nextOrder;
};

export function useSelectionMode(isSelectionMode: boolean) {
  const [, setSelectionMode] = useAtom(selectionModeAtom);
  const [selectedItems, setSelectedItems] = useState<Set<SelectionItemId>>(new Set());
  const [selectedItemOrder, setSelectedItemOrder] = useState<SelectionItemId[]>([]);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);

  // Handle selection mode changes
  useEffect(() => {
    if (!isSelectionMode) {
      setSelectedItems(new Set());
      setSelectedItemOrder([]);
      setIsEditPanelOpen(false);
    }
    // Do not auto-open the edit panel when entering selection mode;
    // it will be opened from the action bar's Edit button.
  }, [isSelectionMode]);

  const toggleItemSelection = useCallback((itemId: SelectionItemId) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
    setSelectedItemOrder((prev) => toggleSelectionOrder(prev, itemId));
  }, []);

  const selectItemRange = useCallback((itemIds: SelectionItemId[]) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      for (const itemId of itemIds) {
        next.add(itemId);
      }
      return next;
    });
    setSelectedItemOrder((prev) => mergeRangeIntoSelectionOrder(prev, itemIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
    setSelectedItemOrder([]);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
  }, [setSelectionMode]);

  return {
    selectedItems,
    setSelectedItems,
    selectedItemOrder,
    setSelectedItemOrder,
    isEditPanelOpen,
    setIsEditPanelOpen,
    toggleItemSelection,
    selectItemRange,
    clearSelection,
    exitSelectionMode,
  };
}
