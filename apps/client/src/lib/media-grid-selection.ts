import type { MediaGridItem } from '@/types';

type SelectionItemId = string | number;

const toPositiveStackId = (value: SelectionItemId | null | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sameSelectionId = (left: SelectionItemId, right: SelectionItemId): boolean =>
  String(left) === String(right);

export const getMediaGridItemStackId = (item: MediaGridItem): number | null =>
  toPositiveStackId(item.stackId ?? item.id);

export const getSelectedMediaGridStackIds = (
  selectedItemOrder: SelectionItemId[],
  items: readonly (MediaGridItem | undefined)[]
): number[] => {
  const stackIds: number[] = [];
  const seenStackIds = new Set<number>();

  for (const selectedItemId of selectedItemOrder) {
    const item = items.find(
      (candidate) => candidate !== undefined && sameSelectionId(candidate.id, selectedItemId)
    );
    const stackId = item ? getMediaGridItemStackId(item) : toPositiveStackId(selectedItemId);

    if (stackId === null || seenStackIds.has(stackId)) {
      continue;
    }

    seenStackIds.add(stackId);
    stackIds.push(stackId);
  }

  return stackIds;
};
