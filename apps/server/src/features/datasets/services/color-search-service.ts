import type { Prisma, PrismaClient } from '@prisma/client';
import { ColorSearchService as StackColorService } from '../../../shared/services/ColorSearchService-fix';
import { ColorExtractor, type DominantColor } from '../../../utils/colorExtractor';

export interface ColorSearchOptions {
  color: { r: number; g: number; b: number };
  threshold?: number; // 0-1の範囲、デフォルト0.8（80%の類似度）
  mediaType?: string;
  limit?: number;
  offset?: number;
}

export interface ColorFilterOptions {
  hueCategories?: string[];
  tonePoint?: { saturation: number; lightness: number };
  toneTolerance?: number;
  similarityThreshold?: number;
  customColor?: string; // カスタムカラー (hex形式)
  mediaType?: string;
  liked?: boolean;
  limit?: number;
  offset?: number;
  // 追加フィルタ条件
  additionalWhere?: Prisma.StackWhereInput;
}

/**
 * 16進数カラーコードをRGBに変換
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
}

type SearchableColor = Pick<
  DominantColor,
  'r' | 'g' | 'b' | 'hex' | 'percentage' | 'hue' | 'saturation' | 'lightness' | 'hueCategory'
>;

type StackColorRow = SearchableColor & { orderIndex?: number };

const HUE_CATEGORY_TARGETS: Record<string, { hue: number; radius: number }> = {
  red: { hue: 0, radius: 15 },
  orange: { hue: 30, radius: 15 },
  yellow: { hue: 60, radius: 15 },
  green: { hue: 105, radius: 30 },
  cyan: { hue: 165, radius: 30 },
  blue: { hue: 225, radius: 30 },
  violet: { hue: 300, radius: 45 },
  gray: { hue: 0, radius: 180 },
};

function isSearchableColor(value: unknown): value is SearchableColor {
  if (typeof value !== 'object' || value === null) return false;
  const color = value as Partial<SearchableColor>;
  return (
    typeof color.r === 'number' &&
    typeof color.g === 'number' &&
    typeof color.b === 'number' &&
    typeof color.hex === 'string' &&
    typeof color.hue === 'number' &&
    typeof color.saturation === 'number' &&
    typeof color.lightness === 'number' &&
    typeof color.hueCategory === 'string'
  );
}

function getDominantColorArray(value: Prisma.JsonValue | null): SearchableColor[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSearchableColor).slice(0, 3);
}

function getTopThreeColors(tableColors: StackColorRow[], jsonColors: Prisma.JsonValue | null) {
  const fromTable = tableColors
    .slice()
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .slice(0, 3);
  if (fromTable.length > 0) return fromTable;
  return getDominantColorArray(jsonColors);
}

function hueDistance(a: number, b: number) {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function hslDistance(color: SearchableColor, target: { h: number; s: number; l: number }): number {
  const normalizedHue = hueDistance(color.hue, target.h) / 1.8;
  return Math.sqrt(
    normalizedHue ** 2 + (color.saturation - target.s) ** 2 + (color.lightness - target.l) ** 2
  );
}

function toneDistance(
  color: SearchableColor,
  tonePoint: { saturation: number; lightness: number }
) {
  return Math.sqrt(
    (color.saturation - tonePoint.saturation) ** 2 + (color.lightness - tonePoint.lightness) ** 2
  );
}

function getHueCategoryMatchScore(
  color: SearchableColor,
  hueCategories: string[] | undefined,
  similarityThreshold: number | undefined
): number | null {
  if (!hueCategories || hueCategories.length === 0) return null;
  if (!hueCategories.includes(color.hueCategory)) return null;

  const threshold = similarityThreshold ?? 0;
  if (threshold <= 0) {
    return 0;
  }

  let bestDistance: number | null = null;
  for (const category of hueCategories) {
    if (category !== color.hueCategory) continue;
    const target = HUE_CATEGORY_TARGETS[category];
    if (!target) return 0;

    const distance = hueDistance(color.hue, target.hue);
    const allowedDistance = Math.max(2, target.radius * (1 - threshold / 100));
    if (distance > allowedDistance) continue;
    bestDistance = bestDistance === null ? distance : Math.min(bestDistance, distance);
  }

  return bestDistance;
}

function getCustomColorTarget(
  customColor: string | undefined,
  tonePoint: { saturation: number; lightness: number } | undefined
) {
  if (!customColor) return null;
  const customRgb = hexToRgb(customColor);
  if (!customRgb) return null;
  const hsl = ColorExtractor.rgbToHsl(customRgb.r, customRgb.g, customRgb.b);
  return {
    h: hsl.h,
    s: tonePoint?.saturation ?? hsl.s,
    l: tonePoint?.lightness ?? hsl.l,
  };
}

function getColorMatchScore(color: SearchableColor, options: ColorFilterOptions): number | null {
  const {
    hueCategories,
    tonePoint,
    toneTolerance = 20,
    customColor,
    similarityThreshold,
  } = options;
  const target = getCustomColorTarget(customColor, tonePoint);
  const hueScore = getHueCategoryMatchScore(color, hueCategories, similarityThreshold);

  if (hueCategories && hueCategories.length > 0 && hueScore === null) {
    return null;
  }

  if (target) {
    const customSimilarityThreshold = similarityThreshold ?? 85;
    const tolerance = Math.max(8, (100 - customSimilarityThreshold) * 1.5);
    const distance = hslDistance(color, target);
    return distance <= tolerance ? distance : null;
  }

  if (tonePoint) {
    const distance = toneDistance(color, tonePoint);
    return distance <= toneTolerance ? distance : null;
  }

  if (hueCategories && hueCategories.length > 0) {
    return hueScore;
  }

  return null;
}

export const createColorSearchService = (deps: { prisma: PrismaClient; dataSetId: number }) => {
  const { prisma, dataSetId } = deps;
  const stackColorService = new StackColorService(prisma);

  /**
   * 色フィルタでマッチするスタックIDのみを取得
   */
  async function getColorMatchingStackIds(options: ColorFilterOptions): Promise<number[]> {
    const { hueCategories, tonePoint, customColor, mediaType, liked, additionalWhere } = options;

    if (!hueCategories?.length && !tonePoint && !customColor) {
      return [];
    }

    const where: Prisma.StackWhereInput = {
      dataSetId,
      ...(additionalWhere ?? {}),
      ...(mediaType ? { mediaType } : {}),
      ...(liked !== undefined ? { liked: liked ? { gt: 0 } : 0 } : {}),
    };

    const stacks = await prisma.stack.findMany({
      where,
      select: {
        id: true,
        dominantColors: true,
        colors: {
          orderBy: { orderIndex: 'asc' },
          take: 3,
        },
      },
    });

    const matched = stacks
      .map((stack) => {
        const colors = getTopThreeColors(stack.colors, stack.dominantColors);
        let bestScore: number | null = null;

        for (const color of colors) {
          const score = getColorMatchScore(color, options);
          if (score === null) continue;
          bestScore = bestScore === null ? score : Math.min(bestScore, score);
        }

        return bestScore === null ? null : { id: stack.id, score: bestScore };
      })
      .filter((result): result is { id: number; score: number } => result !== null)
      .sort((a, b) => a.score - b.score);

    return matched.map((result) => result.id);
  }

  /**
   * 色検索（DB最適化版）
   */
  async function searchByColor(options: ColorSearchOptions) {
    const { color, threshold = 0.8, mediaType, limit = 50, offset = 0 } = options;

    const hex = ColorExtractor.rgbToHex(color.r, color.g, color.b);
    const allMatchedIds = await getColorMatchingStackIds({
      customColor: hex,
      similarityThreshold: Math.round(threshold * 100),
      mediaType,
    });
    const stackIds = allMatchedIds.slice(offset, offset + limit);

    const stacksWithRelations = await prisma.stack.findMany({
      where: { id: { in: stackIds } },
      include: {
        author: true,
        tags: {
          include: {
            tag: true,
          },
        },
        assets: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { assets: true },
        },
      },
    });

    const idToStack = new Map(stacksWithRelations.map((s) => [s.id, s]));
    const orderedStacks = stackIds.map((id) => idToStack.get(id)).filter((s) => s);

    return {
      stacks: orderedStacks,
      total: allMatchedIds.length,
      searchColor: {
        rgb: color,
        hsl: ColorExtractor.rgbToHsl(color.r, color.g, color.b),
        hex,
      },
    };
  }

  /**
   * 色フィルタ検索（DB最適化版 - 修正版）
   */
  async function searchByColorFilter(options: ColorFilterOptions) {
    const { additionalWhere, limit = 50, offset = 0 } = options;
    const allMatchedIds = await getColorMatchingStackIds(options);
    const stackIds = allMatchedIds.slice(offset, offset + limit);

    const stacksWithRelations = await prisma.stack.findMany({
      where: {
        id: { in: stackIds },
        ...(additionalWhere ?? {}),
      },
      include: {
        author: true,
        tags: {
          include: {
            tag: true,
          },
        },
        assets: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { assets: true },
        },
      },
    });

    const idToStack = new Map(stacksWithRelations.map((s) => [s.id, s]));
    const orderedStacks = stackIds.map((id) => idToStack.get(id)).filter((s) => s);

    return {
      stacks: orderedStacks,
      total: allMatchedIds.length,
      limit,
      offset,
    };
  }

  /**
   * データセット全体の色情報を更新（キューに追加）
   */
  async function updateDatasetColors(forceRegenerate = false): Promise<number> {
    // データセット内の画像・動画を含むスタックを取得
    const whereCondition: Prisma.StackWhereInput = {
      dataSetId,
      assets: {
        some: {
          fileType: {
            in: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'],
          },
        },
      },
    };

    // forceRegenerateがfalseの場合は、色情報がないスタックのみ対象
    if (!forceRegenerate) {
      whereCondition.colors = {
        none: {},
      };
    }

    const stacks = await prisma.stack.findMany({
      where: whereCondition,
      select: { id: true },
    });

    if (stacks.length === 0) {
      return 0;
    }

    const total = stacks.length;
    const concurrency = Math.min(4, total);
    let cursor = 0;

    const runWorker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= total) break;
        const stackId = stacks[index]?.id;
        if (!stackId) continue;

        try {
          await stackColorService.updateStackColors(stackId, { forceRegenerate });
        } catch (error) {
          console.error(`Failed to update colors for stack ${stackId}:`, error);
        }
      }
    };

    void Promise.all(Array.from({ length: concurrency }, runWorker)).then(() => {
      console.log(
        `Color refresh completed for dataset ${dataSetId}: processed ${total} stacks (force=${forceRegenerate})`
      );
    });

    return total;
  }

  /**
   * 色データの移行状況をチェック
   */
  async function checkColorMigrationStatus() {
    const stacksWithJson = await prisma.stack.count({
      where: { dominantColors: { not: null }, dataSetId },
    });
    const stacksWithTable = await prisma.stackColor.groupBy({
      by: ['stackId'],
      where: {
        stack: { dataSetId },
      },
      _count: true,
    });
    const assetsWithJson = await prisma.asset.count({
      where: {
        dominantColors: { not: null },
        stack: { dataSetId },
      },
    });
    const assetsWithTable = await prisma.assetColor.groupBy({
      by: ['assetId'],
      where: {
        asset: {
          stack: { dataSetId },
        },
      },
      _count: true,
    });

    return {
      stacks: {
        withJson: stacksWithJson,
        withTable: stacksWithTable.length,
        migrationComplete: stacksWithJson === stacksWithTable.length,
      },
      assets: {
        withJson: assetsWithJson,
        withTable: assetsWithTable.length,
        migrationComplete: assetsWithJson === assetsWithTable.length,
      },
    };
  }

  return {
    getColorMatchingStackIds,
    searchByColor,
    searchByColorFilter,
    updateDatasetColors,
    checkColorMigrationStatus,
  };
};
