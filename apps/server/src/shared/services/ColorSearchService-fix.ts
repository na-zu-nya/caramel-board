import { Prisma, type PrismaClient } from '@prisma/client';
import { DataStorage } from '../../lib/DataStorage';
import type { DominantColor } from '../../utils/colorExtractor';
import { ColorExtractor } from '../../utils/colorExtractor';

type AssetWithColorData = {
  id: number;
  file: string;
  thumbnail: string | null;
  fileType: string;
  dominantColors: Prisma.JsonValue | null;
};

export interface ColorSearchOptions {
  color: { r: number; g: number; b: number };
  threshold?: number; // 0-1の範囲、デフォルト0.8（80%の類似度）
  dataSetId?: number;
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
  dataSetId?: number;
  mediaType?: string;
  limit?: number;
  offset?: number;
}

type StackRow = { id: number } & Record<string, unknown>;

const isDominantColor = (value: unknown): value is DominantColor => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DominantColor>;
  return (
    typeof candidate.r === 'number' &&
    typeof candidate.g === 'number' &&
    typeof candidate.b === 'number' &&
    typeof candidate.hex === 'string'
  );
};

export class ColorSearchService {
  private prisma: PrismaClient;
  private static readonly imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
  private static readonly videoExtensions = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * スタックの代表色を再計算して保存
   */
  async updateStackColors(stackId: number, options?: { forceRegenerate?: boolean }) {
    const forceRegenerate = options?.forceRegenerate ?? false;
    const stack = await this.prisma.stack.findUnique({
      where: { id: stackId },
      select: { dataSetId: true },
    });

    if (!stack) {
      return null;
    }

    const assets = await this.prisma.asset.findMany({
      where: { stackId },
      select: {
        id: true,
        file: true,
        thumbnail: true,
        fileType: true,
        dominantColors: true,
      },
    });

    const validColorSets: DominantColor[][] = [];

    for (const asset of assets) {
      let colors: DominantColor[] | null = null;

      if (!forceRegenerate) {
        colors = this.extractDominantColorArray(asset.dominantColors);
      }

      if (!colors) {
        const regenerated = await this.regenerateAssetColors(asset);
        if (regenerated && regenerated.length > 0) {
          colors = regenerated;
          await this.prisma.asset.update({
            where: { id: asset.id },
            data: { dominantColors: regenerated },
          });
        } else if (!forceRegenerate) {
          // 既存データが null かつ再生成できない場合はスキップ
          colors = null;
        } else {
          // 強制再生成時に失敗した場合は既存データをそのまま使う（消失しないように）
          colors = this.extractDominantColorArray(asset.dominantColors);
        }
      }

      if (colors && colors.length > 0) {
        validColorSets.push(colors);
      }
    }

    if (validColorSets.length === 0) {
      await this.prisma.stack.update({ where: { id: stackId }, data: { dominantColors: null } });
      await this.prisma.stackColor.deleteMany({ where: { stackId } });
      return null;
    }

    const aggregated = ColorExtractor.aggregateStackColors(validColorSets);

    await this.prisma.stack.update({
      where: { id: stackId },
      data: { dominantColors: aggregated },
    });

    await this.prisma.stackColor.deleteMany({ where: { stackId } });

    if (aggregated.length > 0) {
      const records = aggregated.map((color, index) => ({
        stackId,
        r: color.r,
        g: color.g,
        b: color.b,
        hex: color.hex,
        percentage: color.percentage,
        hue: color.hue,
        saturation: color.saturation,
        lightness: color.lightness,
        hueCategory: color.hueCategory,
        orderIndex: index,
      }));

      await this.prisma.stackColor.createMany({ data: records });
    }

    return aggregated;
  }

  private extractDominantColorArray(value: Prisma.JsonValue | null): DominantColor[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const colors: DominantColor[] = [];
    for (const entry of value) {
      if (isDominantColor(entry)) {
        colors.push(entry);
      } else {
        return null;
      }
    }

    return colors;
  }

  private async regenerateAssetColors(asset: AssetWithColorData): Promise<DominantColor[] | null> {
    const extension = asset.fileType?.toLowerCase() ?? '';

    if (ColorSearchService.imageExtensions.has(extension)) {
      return this.extractFromPath(asset.file);
    }

    if (ColorSearchService.videoExtensions.has(extension) && asset.thumbnail) {
      return this.extractFromPath(asset.thumbnail);
    }

    return null;
  }

  private async extractFromPath(key: string): Promise<DominantColor[] | null> {
    try {
      const absolutePath = DataStorage.getPath(key);
      const colors = await ColorExtractor.extractDominantColors(absolutePath, 3);
      if (colors.length === 0) {
        return null;
      }
      return colors;
    } catch (error) {
      console.error('Failed to extract dominant colors from path', key, error);
      return null;
    }
  }

  /**
   * 16進数カラーコードをRGBに変換
   */
  private static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: Number.parseInt(result[1], 16),
          g: Number.parseInt(result[2], 16),
          b: Number.parseInt(result[3], 16),
        }
      : null;
  }

  /**
   * 色検索（DB最適化版）
   */
  async searchByColor(options: ColorSearchOptions) {
    const { color, threshold = 0.8, dataSetId, mediaType, limit = 50, offset = 0 } = options;

    // RGBをHSLに変換
    const targetHsl = ColorExtractor.rgbToHsl(color.r, color.g, color.b);
    const hueCategory = ColorExtractor.getHueCategory(targetHsl.h);

    // 色の距離閾値を計算（0-1を0-100に変換）
    const maxDistance = (1 - threshold) * 100;

    // SQLクエリを構築
    const where: Prisma.StackWhereInput = {};
    if (dataSetId) where.dataSetId = dataSetId;
    if (mediaType) where.mediaType = mediaType;

    // まず色相カテゴリで絞り込み、その後距離計算
    const stacks = await this.prisma.$queryRaw<StackRow[]>`
      WITH filtered_stacks AS (
        SELECT DISTINCT s.*
        FROM "Stack" s
        INNER JOIN "StackColor" sc ON s.id = sc."stackId"
        WHERE sc."hueCategory" = ${hueCategory}
          ${dataSetId ? Prisma.sql`AND s."dataSetId" = ${dataSetId}` : Prisma.empty}
          ${mediaType ? Prisma.sql`AND s."mediaType" = ${mediaType}` : Prisma.empty}
      ),
      color_distances AS (
        SELECT 
          fs.*,
          MIN(
            SQRT(
              POWER(sc.hue - ${targetHsl.h}, 2) + 
              POWER(sc.saturation - ${targetHsl.s}, 2) + 
              POWER(sc.lightness - ${targetHsl.l}, 2)
            )
          ) as min_distance
        FROM filtered_stacks fs
        INNER JOIN "StackColor" sc ON fs.id = sc."stackId"
        GROUP BY fs.id, fs.name, fs.thumbnail, fs."createdAt", fs."updateAt",
                 fs.meta, fs."mediaType", fs.liked,
                 fs."authorId", fs."dataSetId", fs."dominantColors"
      )
      SELECT * FROM color_distances
      WHERE min_distance <= ${maxDistance}
      ORDER BY min_distance ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // 関連データを取得
    const stackIds = stacks.map((s) => s.id);
    const stacksWithRelations = await this.prisma.stack.findMany({
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

    // 元の順序を保持
    const idToStack = new Map(stacksWithRelations.map((stack) => [stack.id, stack]));
    const orderedStacks = stacks
      .map((stack) => idToStack.get(stack.id))
      .filter((stack): stack is (typeof stacksWithRelations)[number] => Boolean(stack));

    return {
      stacks: orderedStacks,
      total: await this.getColorSearchCount(
        targetHsl,
        hueCategory,
        maxDistance,
        dataSetId,
        mediaType
      ),
      searchColor: {
        rgb: color,
        hsl: targetHsl,
        hex: `#${((1 << 24) + (color.r << 16) + (color.g << 8) + color.b).toString(16).slice(1)}`,
      },
    };
  }

  /**
   * 色フィルタ検索（DB最適化版 - 修正版）
   */
  async searchByColorFilter(options: ColorFilterOptions) {
    const {
      hueCategories,
      tonePoint,
      toneTolerance = 10,
      customColor,
      dataSetId,
      mediaType,
      limit = 50,
      offset = 0,
    } = options;

    // 基本的なクエリビルダー
    const conditions: string[] = [];

    if (dataSetId) {
      conditions.push(`s."dataSetId" = ${dataSetId}`);
    }
    if (mediaType) {
      conditions.push(`s."mediaType" = '${mediaType}'`);
    }
    if (hueCategories && hueCategories.length > 0) {
      conditions.push(`sc."hueCategory" IN (${hueCategories.map((h) => `'${h}'`).join(', ')})`);
    }
    if (tonePoint && toneTolerance < 100) {
      conditions.push(`SQRT(
        POWER(sc.saturation - ${tonePoint.saturation}, 2) + 
        POWER(sc.lightness - ${tonePoint.lightness}, 2)
      ) <= ${toneTolerance}`);
    }
    if (customColor) {
      const customRgb = ColorSearchService.hexToRgb(customColor);
      if (customRgb) {
        const customHsl = ColorExtractor.rgbToHsl(customRgb.r, customRgb.g, customRgb.b);
        conditions.push(`SQRT(
          POWER(sc.hue - ${customHsl.h}, 2) + 
          POWER(sc.saturation - ${customHsl.s}, 2) + 
          POWER(sc.lightness - ${customHsl.l}, 2)
        ) <= 30`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // シンプルなクエリに変更
    const queryString = `
      WITH color_filtered AS (
        SELECT DISTINCT s.id
        FROM "Stack" s
        INNER JOIN "StackColor" sc ON s.id = sc."stackId"
        ${whereClause}
      )
      SELECT s.* FROM "Stack" s
      INNER JOIN color_filtered cf ON s.id = cf.id
      ORDER BY s."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const stacks = await this.prisma.$queryRawUnsafe<StackRow[]>(queryString);

    // 関連データを取得
    const stackIds = stacks.map((s) => s.id);
    const stacksWithRelations = await this.prisma.stack.findMany({
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

    // 元の順序を保持
    const idToStack = new Map(stacksWithRelations.map((stack) => [stack.id, stack]));
    const orderedStacks = stacks
      .map((stack) => idToStack.get(stack.id))
      .filter((stack): stack is (typeof stacksWithRelations)[number] => Boolean(stack));

    return {
      stacks: orderedStacks,
      total: await this.getColorFilterCount(options),
      limit,
      offset,
    };
  }

  /**
   * 色データの移行状況をチェック
   */
  async checkColorMigrationStatus() {
    const stacksWithJson = await this.prisma.stack.count({
      where: { dominantColors: { not: null } },
    });
    const stacksWithTable = await this.prisma.stackColor.groupBy({
      by: ['stackId'],
      _count: true,
    });
    const assetsWithJson = await this.prisma.asset.count({
      where: { dominantColors: { not: null } },
    });
    const assetsWithTable = await this.prisma.assetColor.groupBy({
      by: ['assetId'],
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

  /**
   * 色検索の総件数取得
   */
  private async getColorSearchCount(
    targetHsl: { h: number; s: number; l: number },
    hueCategory: string,
    maxDistance: number,
    dataSetId?: number,
    mediaType?: string
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH filtered_stacks AS (
        SELECT DISTINCT s.id
        FROM "Stack" s
        INNER JOIN "StackColor" sc ON s.id = sc."stackId"
        WHERE sc."hueCategory" = ${hueCategory}
          ${dataSetId ? Prisma.sql`AND s."dataSetId" = ${dataSetId}` : Prisma.empty}
          ${mediaType ? Prisma.sql`AND s."mediaType" = ${mediaType}` : Prisma.empty}
      ),
      color_distances AS (
        SELECT 
          fs.id,
          MIN(
            SQRT(
              POWER(sc.hue - ${targetHsl.h}, 2) + 
              POWER(sc.saturation - ${targetHsl.s}, 2) + 
              POWER(sc.lightness - ${targetHsl.l}, 2)
            )
          ) as min_distance
        FROM filtered_stacks fs
        INNER JOIN "StackColor" sc ON fs.id = sc."stackId"
        GROUP BY fs.id
      )
      SELECT COUNT(*)::int as count FROM color_distances
      WHERE min_distance <= ${maxDistance}
    `;

    return Number(result[0]?.count || 0);
  }

  /**
   * 色フィルタの総件数取得（修正版）
   */
  private async getColorFilterCount(options: ColorFilterOptions): Promise<number> {
    const {
      hueCategories,
      tonePoint,
      toneTolerance = 10,
      customColor,
      dataSetId,
      mediaType,
    } = options;

    const conditions: string[] = [];

    if (dataSetId) {
      conditions.push(`s."dataSetId" = ${dataSetId}`);
    }
    if (mediaType) {
      conditions.push(`s."mediaType" = '${mediaType}'`);
    }
    if (hueCategories && hueCategories.length > 0) {
      conditions.push(`sc."hueCategory" IN (${hueCategories.map((h) => `'${h}'`).join(', ')})`);
    }
    if (tonePoint && toneTolerance < 100) {
      conditions.push(`SQRT(
        POWER(sc.saturation - ${tonePoint.saturation}, 2) + 
        POWER(sc.lightness - ${tonePoint.lightness}, 2)
      ) <= ${toneTolerance}`);
    }
    if (customColor) {
      const customRgb = ColorSearchService.hexToRgb(customColor);
      if (customRgb) {
        const customHsl = ColorExtractor.rgbToHsl(customRgb.r, customRgb.g, customRgb.b);
        conditions.push(`SQRT(
          POWER(sc.hue - ${customHsl.h}, 2) + 
          POWER(sc.saturation - ${customHsl.s}, 2) + 
          POWER(sc.lightness - ${customHsl.l}, 2)
        ) <= 30`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const queryString = `
      SELECT COUNT(DISTINCT s.id)::int as count
      FROM "Stack" s
      INNER JOIN "StackColor" sc ON s.id = sc."stackId"
      ${whereClause}
    `;

    const result = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(queryString);
    return Number(result[0]?.count || 0);
  }
}
