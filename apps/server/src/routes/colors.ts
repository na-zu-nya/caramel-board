import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { StandaloneColorRepository } from '../repositories/sqlite/color-repository';
import { useResponse } from '../utils/useResponse.js';

const app = new Hono();
const colorRepository = new StandaloneColorRepository();

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type ColorSearchRequest = z.infer<typeof ColorSearchSchema> & {
  color: RgbColor;
  threshold: number;
  limit: number;
  offset: number;
};

type MultiColorSearchRequest = z.infer<typeof MultiColorSearchSchema> & {
  colors: RgbColor[];
  threshold: number;
  limit: number;
  offset: number;
};

type ColorFilterRequest = z.infer<typeof ColorFilterSchema> & {
  saturationRange?: { min: number; max: number };
  lightnessRange?: { min: number; max: number };
  limit: number;
  offset: number;
};

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
    const params = c.req.valid('json') as ColorSearchRequest;
    const result = colorRepository.searchByColor(params);
    return useResponse(c, result);
  } catch (error) {
    console.error('Color search error:', error);
    return useResponse(c, { error: '色検索に失敗しました' }, 500);
  }
});

// 複数色で検索（OR条件）
app.post('/search-multi', zValidator('json', MultiColorSearchSchema), async (c) => {
  try {
    const { colors, ...options } = c.req.valid('json') as MultiColorSearchRequest;
    const result = colorRepository.searchByMultipleColors({
      colors,
      ...options,
    });
    return useResponse(c, result);
  } catch (error) {
    console.error('Multi-color search error:', error);
    return useResponse(c, { error: '複数色検索に失敗しました' }, 500);
  }
});

// 色域フィルタで検索
app.post('/filter', zValidator('json', ColorFilterSchema), async (c) => {
  try {
    const params = c.req.valid('json') as ColorFilterRequest;
    const result = colorRepository.searchByColorFilter(params);
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
      const colors = colorRepository.updateStackColors(stackId);

      if (!colors) {
        return useResponse(c, {
          success: false,
          colors: null,
          reason: 'STACK_ASSET_COLORS_MISSING',
          message: 'スタックに画像アセットが見つからないか、色情報が未生成です',
        });
      }

      return useResponse(c, {
        success: true,
        colors,
        message: `スタック ${stackId} の色情報を更新しました`,
      });
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
      const totalStacks = colorRepository.getDatasetUpdateCandidateCount(datasetId);
      if (totalStacks === 0) {
        return useResponse(
          c,
          {
            success: false,
            message: 'データセットに画像・動画スタックが見つかりません',
          },
          404
        );
      }
      return useResponse(c, {
        success: true,
        message: `データセット ${datasetId} の ${totalStacks} 個のスタックは既存色情報を利用できます`,
        totalStacks,
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
      const stats = colorRepository.getStats(dataSetId);
      return useResponse(c, stats);
    } catch (error) {
      console.error('Color stats error:', error);
      return useResponse(c, { error: '統計情報の取得に失敗しました' }, 500);
    }
  }
);

export const colorsRoute = app;
