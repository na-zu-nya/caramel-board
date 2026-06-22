import type { ColorFilter, StackFilter } from '@/types';

function sortedValues<T extends string>(values: T[] | undefined): T[] | undefined {
  if (!values || values.length === 0) return undefined;
  return [...values].sort();
}

function normalizeColorFilter(colorFilter: ColorFilter | undefined) {
  if (!colorFilter) return undefined;
  return {
    hueCategories: sortedValues(colorFilter.hueCategories),
    tonePoint: colorFilter.tonePoint
      ? {
          saturation: colorFilter.tonePoint.saturation,
          lightness: colorFilter.tonePoint.lightness,
        }
      : undefined,
    toneSaturation: colorFilter.toneSaturation ?? undefined,
    toneLightness: colorFilter.toneLightness ?? undefined,
    toneTolerance: colorFilter.toneTolerance ?? undefined,
    similarityThreshold: colorFilter.similarityThreshold ?? undefined,
    customColor: colorFilter.customColor ?? undefined,
  };
}

export function getStackFilterKey(filter: StackFilter | null | undefined): string {
  const current = filter ?? {};
  return JSON.stringify({
    datasetId: current.datasetId ?? undefined,
    collectionId: current.collectionId ?? undefined,
    mediaCategory: current.mediaCategory ?? undefined,
    mediaTypes: sortedValues(current.mediaTypes),
    tags: sortedValues(current.tags),
    authors: sortedValues(current.authors),
    isFavorite: current.isFavorite ?? undefined,
    isLiked: current.isLiked ?? undefined,
    search: current.search ?? undefined,
    colorFilter: normalizeColorFilter(current.colorFilter),
    hasNoTags: current.hasNoTags ?? undefined,
    hasNoAuthor: current.hasNoAuthor ?? undefined,
  });
}

export function areStackFiltersEqual(
  left: StackFilter | null | undefined,
  right: StackFilter | null | undefined
): boolean {
  return getStackFilterKey(left) === getStackFilterKey(right);
}
