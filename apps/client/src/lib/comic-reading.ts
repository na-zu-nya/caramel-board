import type {
  Asset,
  ComicDisplayMode,
  ComicOpeningDirection,
  ComicReadingSettings,
  ComicSourceMode,
} from '@/types';

export const DEFAULT_COMIC_OPENING_DIRECTION: ComicOpeningDirection = 'right-opening';
export const DEFAULT_COMIC_SOURCE_MODE: ComicSourceMode = 'single-pages';
export const DEFAULT_WIDE_ASPECT_RATIO_THRESHOLD = 1.35;

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
  sourceMode: ComicSourceMode;
  firstPageSingle: boolean;
  wideAspectRatioThreshold: number;
}

export const normalizeComicReadingSettings = (
  settings?: ComicReadingSettings | null
): NormalizedComicReadingSettings => ({
  openingDirection: settings?.openingDirection ?? DEFAULT_COMIC_OPENING_DIRECTION,
  spreadDisplayEnabled: settings?.spreadDisplayEnabled ?? false,
  displayMode: settings?.displayMode,
  sourceMode: settings?.sourceMode ?? DEFAULT_COMIC_SOURCE_MODE,
  firstPageSingle: settings?.firstPageSingle ?? true,
  wideAspectRatioThreshold:
    settings?.wideAspectRatioThreshold ?? DEFAULT_WIDE_ASPECT_RATIO_THRESHOLD,
});

export const getAssetAspectRatio = (asset: Asset) => {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
};

export const isWideSpreadAsset = (asset: Asset, threshold: number) => {
  const ratio = getAssetAspectRatio(asset);
  return ratio !== null && ratio >= threshold;
};

const getSplitSegmentOrder = (
  openingDirection: ComicOpeningDirection
): ['left' | 'right', 'left' | 'right'] =>
  openingDirection === 'right-opening' ? ['right', 'left'] : ['left', 'right'];

const createLogicalPages = (
  assets: Asset[],
  settings: NormalizedComicReadingSettings
): LogicalPage[] => {
  const splitOrder = getSplitSegmentOrder(settings.openingDirection);
  const pages: LogicalPage[] = [];

  for (const [assetIndex, asset] of assets.entries()) {
    const assetKey = String(asset.id);
    if (
      settings.sourceMode === 'mixed-spreads' &&
      isWideSpreadAsset(asset, settings.wideAspectRatioThreshold)
    ) {
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

export const getUnitBookmarkState = (unit: ReadingUnit | undefined) =>
  Boolean(unit?.pages.some((page) => page.asset.favorited ?? page.asset.isFavorite));
