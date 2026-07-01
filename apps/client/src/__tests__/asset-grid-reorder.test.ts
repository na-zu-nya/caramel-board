import { describe, expect, it } from 'vitest';
import {
  type AssetGridDropSide,
  getAssetGridCellIndexFromPoint,
  getAssetGridInsertionIndex,
  getAssetGridInsertionIndexForPlaceholder,
  getAssetGridPlaceholderIndex,
  getAssetGridPreviewIndex,
  reorderAssetsByInsertionIndex,
} from '@/components/stack-viewer/asset-grid-reorder';
import type { Asset } from '@/types';

const makeAssets = (...ids: Array<string | number>): Asset[] =>
  ids.map((id, index) => ({
    id,
    stackId: 1,
    file: `/asset-${id}.png`,
    orderInStack: index,
  }));

const assetIds = (assets: Asset[] | null) => assets?.map((asset) => asset.id);

describe('asset grid reorder', () => {
  it('moves an earlier asset to the end using a raw insertion boundary', () => {
    const reordered = reorderAssetsByInsertionIndex(makeAssets(1, 2, 3, 4), 2, 4);

    expect(assetIds(reordered)).toEqual([1, 3, 4, 2]);
    expect(reordered?.map((asset) => asset.orderInStack)).toEqual([0, 1, 2, 3]);
  });

  it('moves a later asset before an earlier asset', () => {
    const reordered = reorderAssetsByInsertionIndex(makeAssets(1, 2, 3, 4), 4, 1);

    expect(assetIds(reordered)).toEqual([1, 4, 2, 3]);
    expect(reordered?.map((asset) => asset.orderInStack)).toEqual([0, 1, 2, 3]);
  });

  it.each([
    { side: 'before' satisfies AssetGridDropSide, targetIndex: 1, expected: 1 },
    { side: 'after' satisfies AssetGridDropSide, targetIndex: 1, expected: 2 },
  ])(
    'maps $side drop on a target card to the expected boundary',
    ({ side, targetIndex, expected }) => {
      expect(getAssetGridInsertionIndex(targetIndex, side, 4)).toBe(expected);
    }
  );

  it('keeps adjacent self drops as no-ops', () => {
    expect(reorderAssetsByInsertionIndex(makeAssets(1, 2, 3), 2, 1)).toBeNull();
    expect(reorderAssetsByInsertionIndex(makeAssets(1, 2, 3), 2, 2)).toBeNull();
  });

  it('previews affected items by shifting them into their final slots when moving forward', () => {
    expect([0, 1, 2, 3].map((index) => getAssetGridPreviewIndex(index, 1, 4, 4))).toEqual([
      0, 1, 1, 2,
    ]);
  });

  it('previews affected items by shifting them into their final slots when moving backward', () => {
    expect([0, 1, 2, 3].map((index) => getAssetGridPreviewIndex(index, 3, 1, 4))).toEqual([
      0, 2, 3, 3,
    ]);
  });

  it.each([
    { sourceIndex: 1, insertionIndex: 4, expected: 3 },
    { sourceIndex: 3, insertionIndex: 1, expected: 1 },
    { sourceIndex: 1, insertionIndex: 1, expected: null },
    { sourceIndex: 1, insertionIndex: 2, expected: null },
  ])(
    'maps source $sourceIndex and insertion $insertionIndex to placeholder $expected',
    ({ sourceIndex, insertionIndex, expected }) => {
      expect(getAssetGridPlaceholderIndex(sourceIndex, insertionIndex, 4)).toBe(expected);
    }
  );

  it.each([
    { sourceIndex: 0, placeholderIndex: 1, expected: 2 },
    { sourceIndex: 0, placeholderIndex: 3, expected: 4 },
    { sourceIndex: 3, placeholderIndex: 1, expected: 1 },
    { sourceIndex: 1, placeholderIndex: 1, expected: null },
  ])(
    'maps source $sourceIndex and placeholder $placeholderIndex to insertion $expected',
    ({ sourceIndex, placeholderIndex, expected }) => {
      expect(getAssetGridInsertionIndexForPlaceholder(sourceIndex, placeholderIndex, 4)).toBe(
        expected
      );
    }
  );

  it('treats the whole destination cell as its placeholder target', () => {
    const layout = {
      gridLeft: 10,
      gridTop: 20,
      columns: 4,
      itemSize: 100,
      columnGap: 12,
      rowGap: 12,
      topPadding: 48,
      length: 4,
    };

    expect(getAssetGridCellIndexFromPoint({ ...layout, clientX: 10, clientY: 68 })).toBe(0);
    expect(getAssetGridCellIndexFromPoint({ ...layout, clientX: 121, clientY: 68 })).toBeNull();
    expect(getAssetGridCellIndexFromPoint({ ...layout, clientX: 122, clientY: 68 })).toBe(1);
    expect(getAssetGridCellIndexFromPoint({ ...layout, clientX: 222, clientY: 168 })).toBe(1);
  });

  it('accepts equivalent numeric and string asset ids', () => {
    const reordered = reorderAssetsByInsertionIndex(makeAssets(1, 2, 3), '2', 0);

    expect(assetIds(reordered)).toEqual([2, 1, 3]);
  });
});
