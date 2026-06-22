import { type MouseEvent, useCallback, useRef } from 'react';

type SelectionItemId = string | number;

interface SelectionClickItem {
  id: SelectionItemId;
}

interface UseStackSelectionClickOptions<TItem extends SelectionClickItem> {
  items: readonly TItem[];
  isSelectionMode: boolean;
  onBeforeEnterSelectionMode?: () => void;
  onEnterSelectionMode?: (itemId: SelectionItemId, item: TItem) => void;
  onToggleSelection?: (itemId: SelectionItemId, item: TItem) => void;
  onSelectRange?: (itemIds: SelectionItemId[], items: TItem[]) => void;
  onClick?: (item: TItem, event: MouseEvent<HTMLDivElement>) => void;
}

export function useStackSelectionClick<TItem extends SelectionClickItem>({
  items,
  isSelectionMode,
  onBeforeEnterSelectionMode,
  onEnterSelectionMode,
  onToggleSelection,
  onSelectRange,
  onClick,
}: UseStackSelectionClickOptions<TItem>) {
  const lastClickedIndexRef = useRef<number | null>(null);

  const handleClick = useCallback(
    (item: TItem, event: MouseEvent<HTMLDivElement>) => {
      const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
      const recordLastClicked = () => {
        if (itemIndex >= 0) {
          lastClickedIndexRef.current = itemIndex;
        }
      };

      if (event.metaKey || event.ctrlKey || event.altKey) {
        recordLastClicked();
        return;
      }

      if (event.shiftKey) {
        if (!isSelectionMode && !onEnterSelectionMode) {
          return;
        }

        event.preventDefault();

        if (!isSelectionMode) {
          onBeforeEnterSelectionMode?.();
          onEnterSelectionMode?.(item.id, item);
          recordLastClicked();
          return;
        }

        const lastIndex = lastClickedIndexRef.current ?? itemIndex;
        if (lastIndex >= 0 && itemIndex >= 0) {
          const [start, end] =
            lastIndex < itemIndex ? [lastIndex, itemIndex] : [itemIndex, lastIndex];
          const rangeItems = items.slice(start, end + 1);
          const rangeItemIds = rangeItems.map((rangeItem) => rangeItem.id);

          if (rangeItemIds.length > 0 && onSelectRange) {
            onSelectRange(rangeItemIds, rangeItems);
          } else {
            onToggleSelection?.(item.id, item);
          }
        } else {
          onToggleSelection?.(item.id, item);
        }

        recordLastClicked();
        return;
      }

      if (isSelectionMode) {
        event.preventDefault();
        onToggleSelection?.(item.id, item);
        recordLastClicked();
        return;
      }

      onClick?.(item, event);
      recordLastClicked();
    },
    [
      isSelectionMode,
      items,
      onBeforeEnterSelectionMode,
      onClick,
      onEnterSelectionMode,
      onSelectRange,
      onToggleSelection,
    ]
  );

  return { handleClick };
}
