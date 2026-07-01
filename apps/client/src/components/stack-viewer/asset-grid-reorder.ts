import type { Asset } from '@/types';

export type AssetGridDropSide = 'before' | 'after';

export interface AssetGridDropTarget {
  placeholderIndex: number;
  insertionIndex: number;
}

const sameAssetId = (left: Asset['id'], right: Asset['id']) => String(left) === String(right);

const clampInsertionIndex = (insertionIndex: number, length: number) =>
  Math.max(0, Math.min(length, insertionIndex));

export const findAssetGridSourceIndex = (assets: Asset[], draggedAssetId: Asset['id']) =>
  assets.findIndex((asset) => sameAssetId(asset.id, draggedAssetId));

export const getAssetGridDropSide = (clientX: number, rect: DOMRect): AssetGridDropSide =>
  clientX < rect.left + rect.width / 2 ? 'before' : 'after';

export const getAssetGridInsertionIndex = (
  targetIndex: number,
  side: AssetGridDropSide,
  length: number
) => clampInsertionIndex(targetIndex + (side === 'after' ? 1 : 0), length);

export const isAssetGridInsertionNoop = (
  assets: Asset[],
  draggedAssetId: Asset['id'],
  rawInsertionIndex: number
) => {
  const sourceIndex = findAssetGridSourceIndex(assets, draggedAssetId);
  if (sourceIndex < 0) return true;

  const insertionIndex = clampInsertionIndex(rawInsertionIndex, assets.length);
  return insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1;
};

export const getAssetGridPreviewIndex = (
  assetIndex: number,
  sourceIndex: number,
  rawInsertionIndex: number,
  length: number
) => {
  if (sourceIndex < 0 || assetIndex === sourceIndex) return assetIndex;

  const insertionIndex = clampInsertionIndex(rawInsertionIndex, length);
  if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) return assetIndex;

  if (sourceIndex < insertionIndex) {
    return assetIndex > sourceIndex && assetIndex < insertionIndex ? assetIndex - 1 : assetIndex;
  }

  return assetIndex >= insertionIndex && assetIndex < sourceIndex ? assetIndex + 1 : assetIndex;
};

export const getAssetGridPlaceholderIndex = (
  sourceIndex: number,
  rawInsertionIndex: number,
  length: number
) => {
  if (sourceIndex < 0) return null;

  const insertionIndex = clampInsertionIndex(rawInsertionIndex, length);
  if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) return null;

  return sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
};

export const getAssetGridInsertionIndexForPlaceholder = (
  sourceIndex: number,
  rawPlaceholderIndex: number,
  length: number
) => {
  if (sourceIndex < 0 || length <= 0) return null;

  const placeholderIndex = clampInsertionIndex(rawPlaceholderIndex, length - 1);
  if (placeholderIndex === sourceIndex) return null;

  return sourceIndex < placeholderIndex ? placeholderIndex + 1 : placeholderIndex;
};

export const getAssetGridCellIndexFromPoint = ({
  clientX,
  clientY,
  gridLeft,
  gridTop,
  columns,
  itemSize,
  columnGap,
  rowGap,
  topPadding,
  length,
}: {
  clientX: number;
  clientY: number;
  gridLeft: number;
  gridTop: number;
  columns: number;
  itemSize: number;
  columnGap: number;
  rowGap: number;
  topPadding: number;
  length: number;
}) => {
  if (columns <= 0 || itemSize <= 0 || length <= 0) return null;

  const localX = clientX - gridLeft;
  const localY = clientY - gridTop - topPadding;
  if (localX < 0 || localY < 0) return null;

  const columnStep = itemSize + columnGap;
  const rowStep = itemSize + rowGap;
  const column = Math.floor(localX / columnStep);
  const row = Math.floor(localY / rowStep);
  const xInCell = localX - column * columnStep;
  const yInCell = localY - row * rowStep;
  if (column >= columns || xInCell > itemSize || yInCell > itemSize) return null;

  const index = row * columns + column;
  return index >= 0 && index < length ? index : null;
};

export const reorderAssetsByInsertionIndex = (
  assets: Asset[],
  draggedAssetId: Asset['id'],
  rawInsertionIndex: number
) => {
  const sourceIndex = findAssetGridSourceIndex(assets, draggedAssetId);
  if (sourceIndex < 0) return null;

  const insertionIndex = clampInsertionIndex(rawInsertionIndex, assets.length);
  if (isAssetGridInsertionNoop(assets, draggedAssetId, insertionIndex)) return null;

  const nextAssets = assets.slice();
  const [draggedAsset] = nextAssets.splice(sourceIndex, 1);
  const targetIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  nextAssets.splice(targetIndex, 0, draggedAsset);

  return nextAssets.map((asset, index) => ({ ...asset, orderInStack: index }));
};
