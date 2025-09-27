import { Prisma, type PrismaClient } from '@prisma/client';
import { ColorExtractor } from '../../../utils/colorExtractor';

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
  // similarityThreshold is currently ignored for performance/simplicity
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

export const createColorSearchService = (deps: { prisma: PrismaClient; dataSetId: number }) => {
  const { prisma, dataSetId } = deps;

  /**
   * 色フィルタでマッチするスタックIDのみを取得
   */
  async function getColorMatchingStackIds(options: ColorFilterOptions): Promise<number[]> {
    const {
      hueCategories,
      tonePoint,
      toneTolerance = 10,
      customColor,
      similarityThreshold = 85,
      additionalWhere,
    } = options;

    // 基本的なクエリビルダー
    const conditions: string[] = [];

    // データセットIDは必ず含める
    conditions.push(`s."dataSetId" = ${dataSetId}`);

    // 追加のWhere条件を適用
    if (additionalWhere) {
      // Prismaのwhere条件をSQL文字列に変換（簡易版）
      if (additionalWhere.mediaType) {
        conditions.push(`s."mediaType" = '${additionalWhere.mediaType}'`);
      }
      if (additionalWhere.liked !== undefined) {
        if (typeof additionalWhere.liked === 'object' && 'gt' in additionalWhere.liked) {
          conditions.push(`s.liked > 0`);
        } else {
          conditions.push(`s.liked = 0`);
        }
      }
      // タグやコレクションフィルタは後で別途処理
    }

    // 色条件
    const colorConditions: string[] = [];

    if (hueCategories && hueCategories.length > 0) {
      const hue = hueCategories[0];
      colorConditions.push(`sc."hueCategory" = '${hue}'`);
    }

    if (tonePoint && toneTolerance < 100) {
      colorConditions.push(`SQRT(
        POWER(sc.saturation - ${tonePoint.saturation}, 2) + 
        POWER(sc.lightness - ${tonePoint.lightness}, 2)
      ) <= ${toneTolerance}`);
    }

    if (customColor) {
      const customRgb = hexToRgb(customColor);
      if (customRgb) {
        // 類似度は使わず、カスタムカラーの色相カテゴリに限定（高速化）
        const customHsl = ColorExtractor.rgbToHsl(customRgb.r, customRgb.g, customRgb.b);
        const hueCat = ColorExtractor.getHueCategory(customHsl.h);
        colorConditions.push(`sc."hueCategory" = '${hueCat}'`);
      }
    }

    if (colorConditions.length === 0) {
      // 色条件がない場合は空配列を返す
      return [];
    }

    const whereClause = [...conditions, ...colorConditions].join(' AND ');

    const queryString = `
      SELECT DISTINCT s.id
      FROM "Stack" s
      INNER JOIN "StackColor" sc ON s.id = sc."stackId"
      WHERE ${whereClause}
    `;

    let results = await prisma.$queryRawUnsafe<Array<{ id: number }>>(queryString);
    let stackIds = results.map((r) => r.id);

    // Fallback: If StackColor is empty or returned no rows, try dominantColors JSON on Stack
    if (stackIds.length === 0) {
      const jsonConds: string[] = [];
      if (hueCategories && hueCategories.length > 0) {
        const hue = hueCategories[0];
        jsonConds.push(`(dc->>'hueCategory') = '${hue}'`);
      }
      if (tonePoint && toneTolerance < 100) {
        jsonConds.push(`SQRT(
          POWER(((dc->>'saturation')::int) - ${tonePoint.saturation}, 2) + 
          POWER(((dc->>'lightness')::int) - ${tonePoint.lightness}, 2)
        ) <= ${toneTolerance}`);
      }
      if (customColor) {
        const customRgb = hexToRgb(customColor);
        if (customRgb) {
          const customHsl = ColorExtractor.rgbToHsl(customRgb.r, customRgb.g, customRgb.b);
          const hueCat = ColorExtractor.getHueCategory(customHsl.h);
          jsonConds.push(`(dc->>'hueCategory') = '${hueCat}'`);
        }
      }

      if (jsonConds.length > 0) {
        const jsonWhere = [
          `s."dataSetId" = ${dataSetId}`,
          `s."dominantColors" IS NOT NULL`,
          `EXISTS (SELECT 1 FROM jsonb_array_elements(s."dominantColors"::jsonb) dc WHERE ${jsonConds.join(
            ' AND '
          )})`,
        ].join(' AND ');

        const sqlJson = `
          SELECT DISTINCT s.id
          FROM "Stack" s
          WHERE ${jsonWhere}
        `;
        results = await prisma.$queryRawUnsafe<Array<{ id: number }>>(sqlJson);
        stackIds = results.map((r) => r.id);
      }
    }

    // タグやコレクションなどの追加フィルタを適用
    if (
      additionalWhere &&
      (additionalWhere.tags || additionalWhere.collectionStacks || additionalWhere.author)
    ) {
      const filteredStacks = await prisma.stack.findMany({
        where: {
          id: { in: stackIds },
          ...additionalWhere,
        },
        select: { id: true },
      });
      return filteredStacks.map((s) => s.id);
    }

    return stackIds;
  }

  /**
   * 色検索（DB最適化版）
   */
  async function searchByColor(options: ColorSearchOptions) {
    const { color, threshold = 0.8, mediaType, limit = 50, offset = 0 } = options;

    // RGBをHSLに変換
    const targetHsl = ColorExtractor.rgbToHsl(color.r, color.g, color.b);
    const hueCategory = ColorExtractor.getHueCategory(targetHsl.h);

    // 色の距離閾値を計算（0-1を0-100に変換）
    const maxDistance = (1 - threshold) * 100;

    // SQLクエリを構築
    const where: Prisma.StackWhereInput = {};
    where.dataSetId = dataSetId;
    if (mediaType) where.mediaType = mediaType;

    // まず色相カテゴリで絞り込み、その後距離計算
    const stacks = await prisma.$queryRaw<Array<any>>`
      WITH filtered_stacks AS (
        SELECT DISTINCT s.*
        FROM "Stack" s
        INNER JOIN "StackColor" sc ON s.id = sc."stackId"
        WHERE sc."hueCategory" = ${hueCategory}
          AND s."dataSetId" = ${dataSetId}
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

    // 元の順序を保持
    const idToStack = new Map(stacksWithRelations.map((s) => [s.id, s]));
    const orderedStacks = stacks.map((s) => idToStack.get(s.id)).filter((s) => s);

    return {
      stacks: orderedStacks,
      total: await getColorSearchCount(targetHsl, hueCategory, maxDistance, mediaType),
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
  async function searchByColorFilter(options: ColorFilterOptions) {
    const {
      hueCategories,
      tonePoint,
      toneTolerance = 10,
      customColor,
      mediaType,
      liked,
      additionalWhere,
      limit = 50,
      offset = 0,
    } = options;

    // 基本的なクエリビルダー
    const conditions: string[] = [];

    conditions.push(`s."dataSetId" = ${dataSetId}`);
    if (mediaType) {
      conditions.push(`s."mediaType" = '${mediaType}'`);
    }
    if (liked !== undefined) {
      if (liked) {
        conditions.push(`s.liked > 0`);
      } else {
        conditions.push(`s.liked = 0`);
      }
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
      const customRgb = hexToRgb(customColor);
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

    const stacks = await prisma.$queryRawUnsafe<Array<any>>(queryString);

    // 関連データを取得
    const stackIds = stacks.map((s) => s.id);
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

    // 元の順序を保持
    const idToStack = new Map(stacksWithRelations.map((s) => [s.id, s]));
    const orderedStacks = stacks.map((s) => idToStack.get(s.id)).filter((s) => s);

    return {
      stacks: orderedStacks,
      total: await getColorFilterCount(options),
      limit,
      offset,
    };
  }

  /**
   * データセット全体の色情報を更新（キューに追加）
   */
  async function updateDatasetColors(forceRegenerate = false): Promise<number> {
    // データセット内の画像・動画を含むスタックを取得
    const whereCondition: any = {
      dataSetId: dataSetId,
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

    // TODO: 実際にはキューに追加する処理を実装
    // 現時点では件数のみを返す
    return stacks.length;
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

  /**
   * 色検索の総件数取得
   */
  async function getColorSearchCount(
    targetHsl: { h: number; s: number; l: number },
    hueCategory: string,
    maxDistance: number,
    mediaType?: string
  ): Promise<number> {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH filtered_stacks AS (
        SELECT DISTINCT s.id
        FROM "Stack" s
        INNER JOIN "StackColor" sc ON s.id = sc."stackId"
        WHERE sc."hueCategory" = ${hueCategory}
          AND s."dataSetId" = ${dataSetId}
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
  async function getColorFilterCount(options: ColorFilterOptions): Promise<number> {
    const { hueCategories, tonePoint, toneTolerance = 10, customColor, mediaType } = options;

    const conditions: string[] = [];

    conditions.push(`s."dataSetId" = ${dataSetId}`);
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
      const customRgb = hexToRgb(customColor);
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

    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(queryString);
    return Number(result[0]?.count || 0);
  }

  return {
    getColorMatchingStackIds,
    searchByColor,
    searchByColorFilter,
    updateDatasetColors,
    checkColorMigrationStatus,
  };
};
