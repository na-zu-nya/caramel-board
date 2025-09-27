import { zValidator } from '@hono/zod-validator';
import type { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { z } from 'zod';
import { getPrisma } from '../lib/Repository.js';
import { ColorSearchService } from '../shared/services/ColorSearchService-fix';
import { useResponse } from '../utils/useResponse.js';

const app = new Hono();
const colorSearchService = new ColorSearchService(getPrisma());

// 色検索のスキーマ
const ColorSearchSchema = z.object({
  color: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255),
  }),
  threshold: z.number().min(0).max(1).optional().default(0.8),
  dataSetId: z.number().optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

const MultiColorSearchSchema = z.object({
  colors: z
    .array(
      z.object({
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255),
      })
    )
    .min(1)
    .max(5),
  threshold: z.number().min(0).max(1).optional().default(0.8),
  dataSetId: z.number().optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

const ColorFilterSchema = z.object({
  hueCategories: z.array(z.string()).optional(), // ['red', 'blue', 'green', ...]
  saturationRange: z
    .object({
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
    })
    .optional(),
  lightnessRange: z
    .object({
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
    })
    .optional(),
  dataSetId: z.number().optional(),
  mediaType: z.enum(['image', 'comic', 'video']).optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

// 単色で検索
app.post('/search', zValidator('json', ColorSearchSchema), async (c) => {
  try {
    const params = c.req.valid('json');
    const result = await colorSearchService.searchByColor(params);
    return useResponse(c, result);
  } catch (error) {
    console.error('Color search error:', error);
    return useResponse(c, { error: '色検索に失敗しました' }, 500);
  }
});

// 複数色で検索（OR条件）
app.post('/search-multi', zValidator('json', MultiColorSearchSchema), async (c) => {
  try {
    const { colors, ...options } = c.req.valid('json');
    const result = await colorSearchService.searchByMultipleColors(colors, options);
    return useResponse(c, result);
  } catch (error) {
    console.error('Multi-color search error:', error);
    return useResponse(c, { error: '複数色検索に失敗しました' }, 500);
  }
});

// 色域フィルタで検索
app.post('/filter', zValidator('json', ColorFilterSchema), async (c) => {
  try {
    const params = c.req.valid('json');
    const result = await colorSearchService.searchByColorFilter(params);
    return useResponse(c, result);
  } catch (error) {
    console.error('Color filter search error:', error);
    return useResponse(c, { error: '色域フィルタ検索に失敗しました' }, 500);
  }
});

// スタックの色情報を更新
app.post(
  '/stacks/:stackId/update-colors',
  zValidator('param', z.object({ stackId: z.coerce.number() })),
  async (c) => {
    try {
      const { stackId } = c.req.valid('param');
      const colors = await colorSearchService.updateStackColors(stackId);

      if (colors) {
        return useResponse(c, {
          success: true,
          colors,
          message: `スタック ${stackId} の色情報を更新しました`,
        });
      } else {
        return useResponse(
          c,
          {
            success: false,
            message: 'スタックに画像アセットが見つかりません',
          },
          404
        );
      }
    } catch (error) {
      console.error('Color update error:', error);
      return useResponse(c, { error: '色情報の更新に失敗しました' }, 500);
    }
  }
);

// データセット全体の色情報を一括更新
app.post(
  '/datasets/:datasetId/update-all-colors',
  zValidator('param', z.object({ datasetId: z.coerce.number() })),
  async (c) => {
    try {
      const { datasetId } = c.req.valid('param');
      const prisma = getPrisma();

      // データセット内の画像や動画を含むスタックを取得
      const stacks = await prisma.stack.findMany({
        where: {
          dataSetId: datasetId,
          assets: {
            some: {
              fileType: {
                in: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'],
              },
            },
          },
        },
        select: { id: true },
      });

      if (stacks.length === 0) {
        return useResponse(
          c,
          {
            success: false,
            message: 'データセットに画像・動画スタックが見つかりません',
          },
          404
        );
      }

      console.log(`Starting bulk color update for dataset ${datasetId}: ${stacks.length} stacks`);

      // 非同期で処理を開始（レスポンスは即座に返す）
      setImmediate(async () => {
        let processedCount = 0;
        let errorCount = 0;

        for (const stack of stacks) {
          try {
            await colorSearchService.updateStackColors(stack.id);
            processedCount++;
            console.log(`Progress: ${processedCount}/${stacks.length} stacks processed`);
          } catch (error) {
            errorCount++;
            console.error(`Failed to update colors for stack ${stack.id}:`, error);
          }
        }

        console.log(
          `Bulk color update completed for dataset ${datasetId}: ${processedCount} successful, ${errorCount} errors`
        );
      });

      return useResponse(c, {
        success: true,
        message: `データセット ${datasetId} の ${stacks.length} 個のスタックの色情報更新を開始しました`,
        totalStacks: stacks.length,
      });
    } catch (error) {
      console.error('Bulk color update error:', error);
      return useResponse(c, { error: 'データセットの色情報更新に失敗しました' }, 500);
    }
  }
);

// 色情報を持つスタックの統計
app.get(
  '/stats',
  zValidator('query', z.object({ dataSetId: z.coerce.number().optional() })),
  async (c) => {
    try {
      const { dataSetId } = c.req.valid('query');
      const prisma = getPrisma();

      console.log(`Getting color stats for dataSetId: ${dataSetId}`);

      // 段階的にクエリを追加してテスト
      const where: Prisma.StackWhereInput = {};
      if (dataSetId) {
        where.dataSetId = dataSetId;
      }

      // 基本的なカウント
      const totalStacks = await prisma.stack.count({ where });

      // 生のSQLクエリで色情報のカウントをテスト
      const statsRows = dataSetId
        ? await prisma.$queryRaw<Array<{ with_colors: bigint; without_colors: bigint }>>`
          SELECT 
            COUNT(CASE WHEN "dominantColors" IS NOT NULL THEN 1 END) as with_colors,
            COUNT(CASE WHEN "dominantColors" IS NULL THEN 1 END) as without_colors
          FROM "Stack" 
          WHERE "dataSetId" = ${dataSetId}
        `
        : await prisma.$queryRaw<Array<{ with_colors: bigint; without_colors: bigint }>>`
          SELECT 
            COUNT(CASE WHEN "dominantColors" IS NOT NULL THEN 1 END) as with_colors,
            COUNT(CASE WHEN "dominantColors" IS NULL THEN 1 END) as without_colors
          FROM "Stack"
        `;
      const stats = statsRows[0] ?? { with_colors: 0n, without_colors: 0n };
      const totalWithColors = Number(stats.with_colors);
      const totalWithoutColors = Number(stats.without_colors);
      const colorCoverage = totalStacks > 0 ? (totalWithColors / totalStacks) * 100 : 0;

      console.log(
        `Total stacks: ${totalStacks}, With colors: ${totalWithColors}, Coverage: ${colorCoverage.toFixed(
          1
        )}%`
      );

      return useResponse(c, {
        totalStacks,
        totalWithColors,
        totalWithoutColors,
        totalAssets: 0,
        colorCoverage,
      });
    } catch (error) {
      console.error('Color stats error:', error);
      return useResponse(c, { error: '統計情報の取得に失敗しました' }, 500);
    }
  }
);

export const colorsRoute = app;
