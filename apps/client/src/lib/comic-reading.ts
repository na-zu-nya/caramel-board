import type { Asset, ComicDisplayMode, ComicOpeningDirection, ComicReadingSettings } from '@/types';

export const DEFAULT_COMIC_OPENING_DIRECTION: ComicOpeningDirection = 'right-opening';
const AUTO_SPREAD_ASPECT_RATIO_MIN = 1.25;
const AUTO_SPREAD_ASPECT_RATIO_MAX = 2.2;
const SINGLE_PAGE_ASPECT_RATIO_MIN = 0.45;
const SINGLE_PAGE_ASPECT_RATIO_MAX = 0.95;
const SPLIT_PAGE_ASPECT_RATIO_TOLERANCE = 0.2;

export type LogicalPageSegment = 'full' | 'left' | 'right';

export interface LogicalPage {
  id: string;
  asset: Asset;
  assetIndex: number;
  segment: LogicalPageSegment;
}

export interface ReadingUnit {
  id: string;
  index: number;
  pages: LogicalPage[];
  kind: 'single' | 'spread';
}

export interface ComicReadingModel {
  units: ReadingUnit[];
  assetIndexToUnitIndex: Map<number, number>;
  assetIdToUnitIndexes: Map<string | number, number[]>;
}

export interface NormalizedComicReadingSettings {
  openingDirection: ComicOpeningDirection;
  spreadDisplayEnabled: boolean;
  displayMode?: ComicDisplayMode;
  firstPageSingle: boolean;
}

export interface AutoSpreadDetectionContext {
  singlePageAspectRatio: number | null;
}

export const normalizeComicReadingSettings = (
  settings?: ComicReadingSettings | null
): NormalizedComicReadingSettings => ({
  openingDirection: settings?.openingDirection ?? DEFAULT_COMIC_OPENING_DIRECTION,
  spreadDisplayEnabled: settings?.spreadDisplayEnabled ?? false,
  displayMode: settings?.displayMode,
  firstPageSingle: settings?.firstPageSingle ?? true,
});

export const getAssetAspectRatio = (asset: Asset) => {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
};

const getMedian = (values: number[]) => {
  if (values.length === 0) return null;
  const sortedValues = [...values].sort((left, right) => left - right);
  const centerIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[centerIndex];
  return (sortedValues[centerIndex - 1] + sortedValues[centerIndex]) / 2;
};

const isSinglePageAspectRatioCandidate = (ratio: number) =>
  ratio >= SINGLE_PAGE_ASPECT_RATIO_MIN && ratio <= SINGLE_PAGE_ASPECT_RATIO_MAX;

export const inferSinglePageAspectRatio = (assets: Asset[]) =>
  getMedian(
    assets
      .map((asset) => getAssetAspectRatio(asset))
      .filter((ratio): ratio is number => ratio !== null && isSinglePageAspectRatioCandidate(ratio))
  );

export const createAutoSpreadDetectionContext = (assets: Asset[]): AutoSpreadDetectionContext => ({
  singlePageAspectRatio: inferSinglePageAspectRatio(assets),
});

export const isAutoSpreadAsset = (
  asset: Asset,
  context: AutoSpreadDetectionContext = createAutoSpreadDetectionContext([asset])
) => {
  const ratio = getAssetAspectRatio(asset);
  if (ratio === null || ratio < AUTO_SPREAD_ASPECT_RATIO_MIN) return false;

  if (context.singlePageAspectRatio !== null) {
    const splitPageAspectRatio = ratio / 2;
    const relativeDelta =
      Math.abs(splitPageAspectRatio - context.singlePageAspectRatio) /
      context.singlePageAspectRatio;
    return relativeDelta <= SPLIT_PAGE_ASPECT_RATIO_TOLERANCE;
  }

  return ratio <= AUTO_SPREAD_ASPECT_RATIO_MAX;
};

const getSplitSegmentOrder = (): ['right', 'left'] => ['right', 'left'];

const createLogicalPages = (
  assets: Asset[],
  settings: NormalizedComicReadingSettings
): LogicalPage[] => {
  const splitOrder = getSplitSegmentOrder();
  const autoSpreadDetectionContext = createAutoSpreadDetectionContext(assets);
  const pages: LogicalPage[] = [];

  for (const [assetIndex, asset] of assets.entries()) {
    const assetKey = String(asset.id);
    if (settings.spreadDisplayEnabled && isAutoSpreadAsset(asset, autoSpreadDetectionContext)) {
      for (const segment of splitOrder) {
        pages.push({
          id: `${assetKey}:${segment}`,
          asset,
          assetIndex,
          segment,
        });
      }
      continue;
    }

    pages.push({
      id: `${assetKey}:full`,
      asset,
      assetIndex,
      segment: 'full',
    });
  }

  return pages;
};

const areSplitHalvesOfSameAsset = (left: LogicalPage | undefined, right: LogicalPage | undefined) =>
  Boolean(
    left &&
      right &&
      left.asset.id === right.asset.id &&
      left.segment !== 'full' &&
      right.segment !== 'full'
  );

const createUnit = (index: number, pages: LogicalPage[]): ReadingUnit => ({
  id: pages.map((page) => page.id).join('|'),
  index,
  pages,
  kind: pages.length > 1 ? 'spread' : 'single',
});

export function buildComicReadingModel(params: {
  assets: Asset[];
  displayMode: ComicDisplayMode;
  settings?: ComicReadingSettings | null;
}): ComicReadingModel {
  const settings = normalizeComicReadingSettings(params.settings);
  const logicalPages = createLogicalPages(params.assets, settings);
  const units: ReadingUnit[] = [];

  if (params.displayMode === 'single') {
    logicalPages.forEach((page) => {
      units.push(createUnit(units.length, [page]));
    });
  } else {
    let pageIndex = 0;
    while (pageIndex < logicalPages.length) {
      const current = logicalPages[pageIndex];
      const next = logicalPages[pageIndex + 1];
      const shouldKeepSplitSpread = areSplitHalvesOfSameAsset(current, next);
      const shouldUseFirstPageSingle =
        pageIndex === 0 && settings.firstPageSingle && !shouldKeepSplitSpread;

      if (!next || shouldUseFirstPageSingle) {
        units.push(createUnit(units.length, [current]));
        pageIndex += 1;
        continue;
      }

      units.push(createUnit(units.length, [current, next]));
      pageIndex += 2;
    }
  }

  const assetIndexToUnitIndex = new Map<number, number>();
  const assetIdToUnitIndexes = new Map<string | number, number[]>();
  for (const unit of units) {
    for (const page of unit.pages) {
      if (!assetIndexToUnitIndex.has(page.assetIndex)) {
        assetIndexToUnitIndex.set(page.assetIndex, unit.index);
      }
      const currentIndexes = assetIdToUnitIndexes.get(page.asset.id) ?? [];
      if (!currentIndexes.includes(unit.index)) {
        currentIndexes.push(unit.index);
      }
      assetIdToUnitIndexes.set(page.asset.id, currentIndexes);
    }
  }

  return { units, assetIndexToUnitIndex, assetIdToUnitIndexes };
}

export const getRepresentativeAsset = (unit: ReadingUnit | undefined) => unit?.pages[0]?.asset;

export const getLowerLogicalPage = (unit: ReadingUnit | undefined) => unit?.pages[0] ?? null;

export const findReadingUnitIndexForLogicalPage = (
  model: ComicReadingModel,
  page: LogicalPage | null | undefined
) => {
  if (!page) return null;

  const candidateIndexes = model.assetIdToUnitIndexes.get(page.asset.id) ?? [];
  for (const index of candidateIndexes) {
    const unit = model.units[index];
    if (
      unit?.pages.some(
        (candidate) =>
          candidate.assetIndex === page.assetIndex &&
          candidate.asset.id === page.asset.id &&
          candidate.segment === page.segment
      )
    ) {
      return index;
    }
  }

  return null;
};

export const getUnitBookmarkState = (unit: ReadingUnit | undefined) =>
  Boolean(unit?.pages.some((page) => page.asset.favorited ?? page.asset.isFavorite));
