import type { AutoTagClient } from '../../lib/AutoTagClient';
import { getAutoTagClient } from '../../lib/AutoTagClient';
import type { StandaloneColorRepository } from '../../repositories/sqlite/color-repository';
import { hslDistance } from '../../repositories/sqlite/color-repository';
import {
  DEFAULT_AUTO_STOP_TAGS,
  normalizeTag,
  SIMILAR_CONFIG,
} from '../../repositories/sqlite/stack/helpers';
import type { SimilarVectors } from '../../repositories/sqlite/stack/types';
import type { StandaloneStackRepository } from '../../repositories/sqlite/stack-repository';
import { ColorExtractor, type DominantColor } from '../../utils/colorExtractor';

export class UnsupportedImageError extends Error {}

export interface ImageSearchQuery {
  tags: Array<{ key: string; score: number }>;
  colors: Array<{ r: number; g: number; b: number; hex: string; percentage: number }>;
  autoTagAvailable: boolean;
}

interface HslPoint {
  h: number;
  s: number;
  l: number;
}

const computeColorScore = (colors: DominantColor[], queryHsl: HslPoint[]): number => {
  if (colors.length === 0 || queryHsl.length === 0) return 0;
  let minDistance = Number.POSITIVE_INFINITY;
  for (const color of colors) {
    for (const target of queryHsl) {
      const distance = hslDistance(color, target);
      if (distance < minDistance) minDistance = distance;
    }
  }
  return Math.max(0, 1 - minDistance / 100);
};

/**
 * Filters an already score-sorted id list down to the ids that also satisfy
 * every other active filter (as computed by `StandaloneStackRepository.getMatchingStackIds`),
 * then applies offset/limit paging.
 *
 * `getPaginated`'s `stackIds` param is a membership filter only (see
 * `StackQueryService.buildStackWhere`) — its SQL `ORDER BY` always wins over
 * array order, so it cannot be used to preserve image-search score ordering.
 * This helper is the score-order-preserving replacement used by the route.
 */
export function intersectScoredIdsWithEligible(
  scored: Array<{ id: number; score: number }>,
  eligibleIds: Set<number>,
  limit: number,
  offset: number
): { ids: number[]; total: number } {
  const filtered = scored.filter((entry) => eligibleIds.has(entry.id));
  const total = filtered.length;
  const ids = filtered.slice(offset, offset + limit).map((entry) => entry.id);
  return { ids, total };
}

export class ImageStackSearchService {
  constructor(
    private deps: {
      stackRepository: StandaloneStackRepository;
      colorRepository: StandaloneColorRepository;
      autoTagClient?: AutoTagClient;
      extractQueryColors?: (buffer: Buffer) => Promise<DominantColor[]>;
    }
  ) {}

  /**
   * Pure extraction step: decodes the dropped image into a query descriptor
   * (tags + colors). Does not touch stackRepository/colorRepository — no DB
   * scoring happens here.
   */
  async analyzeImage(input: { buffer: Buffer; filename: string }): Promise<ImageSearchQuery> {
    const extractQueryColors =
      this.deps.extractQueryColors ?? ColorExtractor.extractDominantColorsFromBuffer;
    let colors: DominantColor[];
    try {
      colors = await extractQueryColors(input.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new UnsupportedImageError(message);
      if (error instanceof Error) wrapped.cause = error;
      throw wrapped;
    }

    const autoTagClient = this.deps.autoTagClient ?? getAutoTagClient();
    let autoTagAvailable = true;
    let tags: Array<{ key: string; score: number }> = [];

    try {
      const prediction = await autoTagClient.generateTagsFromBuffer(
        input.buffer,
        input.filename,
        0.4
      );
      const stopTags = new Set(DEFAULT_AUTO_STOP_TAGS.map(normalizeTag));
      const filtered: Array<{ tag: string; score: number }> = [];
      for (const [tagKey, score] of Object.entries(prediction.scores)) {
        const tag = normalizeTag(tagKey);
        if (!tag || stopTags.has(tag)) continue;
        if (score < SIMILAR_CONFIG.autoMinScore) continue;
        filtered.push({ tag, score });
      }
      filtered.sort((left, right) => right.score - left.score);
      const auto = new Map(
        filtered.slice(0, SIMILAR_CONFIG.autoTopN).map(({ tag, score }) => [tag, score])
      );
      tags = Array.from(auto.entries()).map(([key, score]) => ({ key, score }));
    } catch (error) {
      console.error('Error generating tags for image search:', error);
      autoTagAvailable = false;
      tags = [];
    }

    return {
      tags,
      colors: colors.map((color) => ({
        r: color.r,
        g: color.g,
        b: color.b,
        hex: color.hex,
        percentage: color.percentage,
      })),
      autoTagAvailable,
    };
  }

  /**
   * Scores every candidate stack against a previously-analyzed query
   * descriptor (tags + colors). Applies an optional score threshold
   * (default 0 — no cutoff) via `input.threshold`, then returns the result
   * sorted by score descending. Pagination and intersection with other
   * filters still happens at the route layer via
   * `intersectScoredIdsWithEligible`.
   */
  getScoredStackIds(
    dataSetId: number,
    input: {
      tags: Array<{ key: string; score: number }>;
      colors: Array<{ r: number; g: number; b: number; hex: string; percentage: number }>;
      tagWeight: number;
      threshold?: number;
    }
  ): Array<{ id: number; score: number }> {
    const queryHsl: HslPoint[] = input.colors.map((color) => {
      const hsl = ColorExtractor.rgbToHsl(color.r, color.g, color.b);
      return { h: hsl.h, s: hsl.s, l: hsl.l };
    });

    let scored: Array<{ id: number; score: number }>;

    if (input.tags.length > 0) {
      const auto = new Map(input.tags.map((tag) => [tag.key, tag.score]));
      const reference: SimilarVectors = { auto, manual: new Set() };
      const tagScored = this.deps.stackRepository.getScoredSimilarByReference(
        dataSetId,
        reference,
        {
          threshold: 0,
        }
      );
      const colorsByStack = this.deps.colorRepository.getDominantColorsByStackIds(
        dataSetId,
        tagScored.map((entry) => entry.id)
      );
      scored = tagScored.map(({ id, score: tagScore }) => {
        const colorScore = computeColorScore(colorsByStack.get(id) ?? [], queryHsl);
        const final = input.tagWeight * tagScore + (1 - input.tagWeight) * colorScore;
        return { id, score: final };
      });
    } else {
      const candidates = this.deps.colorRepository.getCandidateStackIdsWithColors(dataSetId);
      scored = candidates.map((candidate) => ({
        id: candidate.id,
        score: computeColorScore(candidate.dominantColors, queryHsl),
      }));
    }

    const threshold = input.threshold ?? 0;
    return scored
      .filter((entry) => entry.score >= threshold)
      .sort((left, right) => right.score - left.score);
  }
}
