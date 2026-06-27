import { describe, expect, it } from 'vitest';
import { buildComicReadingModel, normalizeComicReadingSettings } from '@/lib/comic-reading';
import type { Asset } from '@/types';

const makeAsset = (id: number, width = 800, height = 1200): Asset => ({
  id,
  stackId: 1,
  file: `/files/${id}.jpg`,
  width,
  height,
});

describe('comic reading model', () => {
  it('defaults automatic spread display to off', () => {
    expect(normalizeComicReadingSettings().spreadDisplayEnabled).toBe(false);
  });

  it('keeps the first page single before synthetic spreads', () => {
    const model = buildComicReadingModel({
      assets: [1, 2, 3, 4, 5].map((id) => makeAsset(id)),
      displayMode: 'spread',
      settings: { sourceMode: 'single-pages', firstPageSingle: true },
    });

    expect(model.units.map((unit) => unit.pages.map((page) => page.asset.id))).toEqual([
      [1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('splits wide mixed-spread assets by right-opening order', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1800, 1000)],
      displayMode: 'single',
      settings: { sourceMode: 'mixed-spreads', openingDirection: 'right-opening' },
    });

    expect(model.units.map((unit) => unit.pages[0]?.segment)).toEqual(['right', 'left']);
  });

  it('splits wide mixed-spread assets by left-opening order', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1800, 1000)],
      displayMode: 'single',
      settings: { sourceMode: 'mixed-spreads', openingDirection: 'left-opening' },
    });

    expect(model.units.map((unit) => unit.pages[0]?.segment)).toEqual(['left', 'right']);
  });

  it('keeps split halves together in spread display', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1800, 1000), makeAsset(2)],
      displayMode: 'spread',
      settings: {
        sourceMode: 'mixed-spreads',
        firstPageSingle: true,
        openingDirection: 'right-opening',
      },
    });

    expect(model.units[0]?.pages.map((page) => page.segment)).toEqual(['right', 'left']);
    expect(model.units[1]?.pages.map((page) => page.asset.id)).toEqual([2]);
  });

  it('maps every bookmarked asset to a reading unit', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1), makeAsset(2), makeAsset(3)],
      displayMode: 'spread',
      settings: { sourceMode: 'single-pages', firstPageSingle: false },
    });

    expect(model.assetIdToUnitIndexes.get(1)).toEqual([0]);
    expect(model.assetIdToUnitIndexes.get(2)).toEqual([0]);
    expect(model.assetIdToUnitIndexes.get(3)).toEqual([1]);
  });
});
