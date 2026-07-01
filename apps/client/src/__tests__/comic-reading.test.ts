import { describe, expect, it } from 'vitest';
import {
  buildComicReadingModel,
  findReadingUnitIndexForLogicalPage,
  getLowerLogicalPage,
  inferSinglePageAspectRatio,
  normalizeComicReadingSettings,
} from '@/lib/comic-reading';
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
      settings: { spreadDisplayEnabled: true, firstPageSingle: true },
    });

    expect(model.units.map((unit) => unit.pages.map((page) => page.asset.id))).toEqual([
      [1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('keeps wide assets intact when automatic spread display is off', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1800, 1000)],
      displayMode: 'single',
      settings: { spreadDisplayEnabled: false },
    });

    expect(model.units.map((unit) => unit.pages[0]?.segment)).toEqual(['full']);
  });

  it('splits wide assets by right-opening order when no page ratio can be inferred', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1800, 1000)],
      displayMode: 'single',
      settings: { spreadDisplayEnabled: true, openingDirection: 'right-opening' },
    });

    expect(model.units.map((unit) => unit.pages[0]?.segment)).toEqual(['right', 'left']);
  });

  it('keeps the logical split order stable when switching to left-opening', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1800, 1000)],
      displayMode: 'single',
      settings: { spreadDisplayEnabled: true, openingDirection: 'left-opening' },
    });

    expect(model.units.map((unit) => unit.pages[0]?.segment)).toEqual(['right', 'left']);
  });

  it('does not split extremely wide assets outside the automatic spread range', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 3000, 1000)],
      displayMode: 'single',
      settings: { spreadDisplayEnabled: true },
    });

    expect(model.units.map((unit) => unit.pages[0]?.segment)).toEqual(['full']);
  });

  it('infers B5-like single page ratio from the stack', () => {
    const assets = [
      makeAsset(1, 2150, 3035),
      makeAsset(2, 4299, 3035),
      makeAsset(3, 4299, 3035),
      makeAsset(4, 2150, 3035),
    ];

    expect(inferSinglePageAspectRatio(assets)).toBeCloseTo(2150 / 3035);
  });

  it('splits B5-like spread scans against the inferred single page ratio', () => {
    const model = buildComicReadingModel({
      assets: [
        makeAsset(1, 2150, 3035),
        makeAsset(2, 4299, 3035),
        makeAsset(3, 4299, 3035),
        makeAsset(4, 2150, 3035),
      ],
      displayMode: 'single',
      settings: { spreadDisplayEnabled: true, openingDirection: 'right-opening' },
    });

    expect(
      model.units.map((unit) =>
        unit.pages.map((page) => ({ assetId: page.asset.id, segment: page.segment }))
      )
    ).toEqual([
      [{ assetId: 1, segment: 'full' }],
      [{ assetId: 2, segment: 'right' }],
      [{ assetId: 2, segment: 'left' }],
      [{ assetId: 3, segment: 'right' }],
      [{ assetId: 3, segment: 'left' }],
      [{ assetId: 4, segment: 'full' }],
    ]);
  });

  it('does not let a square cover prevent automatic B5-like spread detection', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 3000, 3000), makeAsset(2, 4299, 3035)],
      displayMode: 'single',
      settings: { spreadDisplayEnabled: true, openingDirection: 'right-opening' },
    });

    expect(
      model.units.map((unit) =>
        unit.pages.map((page) => ({ assetId: page.asset.id, segment: page.segment }))
      )
    ).toEqual([
      [{ assetId: 1, segment: 'full' }],
      [{ assetId: 2, segment: 'right' }],
      [{ assetId: 2, segment: 'left' }],
    ]);
  });

  it('keeps B5-like split scans as their original spread units in spread display', () => {
    const model = buildComicReadingModel({
      assets: [
        makeAsset(1, 2150, 3035),
        makeAsset(2, 4299, 3035),
        makeAsset(3, 4299, 3035),
        makeAsset(4, 2150, 3035),
      ],
      displayMode: 'spread',
      settings: {
        spreadDisplayEnabled: true,
        firstPageSingle: true,
        openingDirection: 'right-opening',
      },
    });

    expect(
      model.units.map((unit) =>
        unit.pages.map((page) => ({ assetId: page.asset.id, segment: page.segment }))
      )
    ).toEqual([
      [{ assetId: 1, segment: 'full' }],
      [
        { assetId: 2, segment: 'right' },
        { assetId: 2, segment: 'left' },
      ],
      [
        { assetId: 3, segment: 'right' },
        { assetId: 3, segment: 'left' },
      ],
      [{ assetId: 4, segment: 'full' }],
    ]);
  });

  it('keeps B5-like split scans in the same logical order for left-opening display', () => {
    const model = buildComicReadingModel({
      assets: [
        makeAsset(0, 2150, 3035),
        makeAsset(21, 4299, 3035),
        makeAsset(43, 4299, 3035),
        makeAsset(5, 2150, 3035),
      ],
      displayMode: 'spread',
      settings: {
        spreadDisplayEnabled: true,
        firstPageSingle: true,
        openingDirection: 'left-opening',
      },
    });

    expect(
      model.units.map((unit) =>
        unit.pages.map((page) => `${String(page.asset.id)}:${page.segment}`)
      )
    ).toEqual([['0:full'], ['21:right', '21:left'], ['43:right', '43:left'], ['5:full']]);
  });

  it('keeps split halves together in spread display', () => {
    const model = buildComicReadingModel({
      assets: [makeAsset(1, 1600, 1200), makeAsset(2)],
      displayMode: 'spread',
      settings: {
        spreadDisplayEnabled: true,
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
      settings: { spreadDisplayEnabled: true, firstPageSingle: false },
    });

    expect(model.assetIdToUnitIndexes.get(1)).toEqual([0]);
    expect(model.assetIdToUnitIndexes.get(2)).toEqual([0]);
    expect(model.assetIdToUnitIndexes.get(3)).toEqual([1]);
  });

  it('maps the current single page to the spread that contains it', () => {
    const assets = [1, 2, 3, 4, 5].map((id) => makeAsset(id));
    const settings = { spreadDisplayEnabled: true, firstPageSingle: true };
    const singleModel = buildComicReadingModel({
      assets,
      displayMode: 'single',
      settings,
    });
    const spreadModel = buildComicReadingModel({
      assets,
      displayMode: 'spread',
      settings,
    });

    expect(findReadingUnitIndexForLogicalPage(spreadModel, singleModel.units[2]?.pages[0])).toBe(1);
  });

  it('uses the lower page when mapping a spread back to single page display', () => {
    const assets = [1, 2, 3, 4, 5].map((id) => makeAsset(id));
    const settings = { spreadDisplayEnabled: true, firstPageSingle: true };
    const spreadModel = buildComicReadingModel({
      assets,
      displayMode: 'spread',
      settings,
    });
    const singleModel = buildComicReadingModel({
      assets,
      displayMode: 'single',
      settings,
    });

    const lowerPage = getLowerLogicalPage(spreadModel.units[1]);

    expect(lowerPage?.asset.id).toBe(2);
    expect(findReadingUnitIndexForLogicalPage(singleModel, lowerPage)).toBe(1);
  });

  it('maps a split spread half back to its combined spread unit', () => {
    const assets = [makeAsset(1, 1600, 1200), makeAsset(2)];
    const settings = {
      spreadDisplayEnabled: true,
      firstPageSingle: true,
      openingDirection: 'right-opening' as const,
    };
    const singleModel = buildComicReadingModel({
      assets,
      displayMode: 'single',
      settings,
    });
    const spreadModel = buildComicReadingModel({
      assets,
      displayMode: 'spread',
      settings,
    });

    expect(singleModel.units[1]?.pages[0]?.segment).toBe('left');
    expect(findReadingUnitIndexForLogicalPage(spreadModel, singleModel.units[1]?.pages[0])).toBe(0);
  });
});
