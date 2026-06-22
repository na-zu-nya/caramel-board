import type { DatabaseSync } from 'node:sqlite';
import { ColorExtractor, type DominantColor } from '../../utils/colorExtractor';
import { getStandaloneSqlite } from './sqlite';
import { StandaloneStackRepository } from './stack-repository';

interface CountRow {
  count: number;
}

interface StackColorRow {
  id: number;
  dataset_id: number;
  media_type: string;
  dominant_colors_json: string | null;
}

interface AssetColorRow {
  dominant_colors_json: string | null;
}

export interface StandaloneColorSearchOptions {
  color: { r: number; g: number; b: number };
  threshold?: number;
  dataSetId?: number;
  mediaType?: 'image' | 'comic' | 'video';
  limit?: number;
  offset?: number;
}

export interface StandaloneColorFilterOptions {
  hue?: number;
  hex?: string;
  hueCategories?: string[];
  tonePoint?: { saturation: number; lightness: number };
  toneTolerance?: number;
  similarityThreshold?: number;
  customColor?: string;
  saturationRange?: { min: number; max: number };
  lightnessRange?: { min: number; max: number };
  dataSetId?: number;
  mediaType?: 'image' | 'comic' | 'video';
  limit?: number;
  offset?: number;
}

const isDominantColor = (value: unknown): value is DominantColor => {
  if (typeof value !== 'object' || value === null) return false;
  const color = value as Partial<DominantColor>;
  return (
    typeof color.r === 'number' &&
    typeof color.g === 'number' &&
    typeof color.b === 'number' &&
    typeof color.hex === 'string' &&
    typeof color.percentage === 'number' &&
    typeof color.hue === 'number' &&
    typeof color.saturation === 'number' &&
    typeof color.lightness === 'number' &&
    typeof color.hueCategory === 'string'
  );
};

const parseDominantColors = (json: string | null | undefined): DominantColor[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isDominantColor) : [];
  } catch {
    return [];
  }
};

const hueDistance = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
};

const hslDistance = (color: DominantColor, target: { h: number; s: number; l: number }) =>
  Math.sqrt(
    (hueDistance(color.hue, target.h) / 1.8) ** 2 +
      (color.saturation - target.s) ** 2 +
      (color.lightness - target.l) ** 2
  );

const toneDistance = (color: DominantColor, tonePoint: { saturation: number; lightness: number }) =>
  Math.sqrt(
    (color.saturation - tonePoint.saturation) ** 2 + (color.lightness - tonePoint.lightness) ** 2
  );

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

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
};

const getHueCategoryMatchScore = (
  color: DominantColor,
  hueCategories: string[] | undefined,
  similarityThreshold: number | undefined
) => {
  if (!hueCategories?.length) return null;
  if (!hueCategories.includes(color.hueCategory)) return null;

  const threshold = similarityThreshold ?? 0;
  if (threshold <= 0) return 0;

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
};

const getCustomColorTarget = (
  customColor: string | undefined,
  tonePoint: { saturation: number; lightness: number } | undefined
) => {
  if (!customColor) return null;
  const customRgb = hexToRgb(customColor);
  if (!customRgb) return null;
  const hsl = ColorExtractor.rgbToHsl(customRgb.r, customRgb.g, customRgb.b);
  return {
    h: hsl.h,
    s: tonePoint?.saturation ?? hsl.s,
    l: tonePoint?.lightness ?? hsl.l,
  };
};

const getHueTarget = (hue: number | undefined, hex: string | undefined) => {
  if (hue !== undefined) return hue;
  if (!hex) return undefined;
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  return ColorExtractor.rgbToHsl(rgb.r, rgb.g, rgb.b).h;
};

export class StandaloneColorRepository {
  private stackRepository: StandaloneStackRepository;

  constructor(private db: DatabaseSync = getStandaloneSqlite()) {
    this.stackRepository = new StandaloneStackRepository(db);
  }

  searchByColor(options: StandaloneColorSearchOptions) {
    const { color, threshold = 0.8, limit = 50, offset = 0 } = options;
    const targetHsl = ColorExtractor.rgbToHsl(color.r, color.g, color.b);
    const maxDistance = (1 - threshold) * 100;
    const matches = this.getCandidateRows(options)
      .map((row) => {
        const score = this.bestColorDistance(row, (entry) => hslDistance(entry, targetHsl));
        return score === null || score > maxDistance ? null : { id: row.id, score };
      })
      .filter((match): match is { id: number; score: number } => match !== null)
      .sort((left, right) => left.score - right.score);

    const stackIds = matches.slice(offset, offset + limit).map((match) => match.id);
    return {
      stacks: this.getStacksInOrder(stackIds),
      total: matches.length,
      searchColor: {
        rgb: color,
        hsl: targetHsl,
        hex: ColorExtractor.rgbToHex(color.r, color.g, color.b),
      },
    };
  }

  searchByMultipleColors(options: {
    colors: Array<{ r: number; g: number; b: number }>;
    threshold?: number;
    dataSetId?: number;
    mediaType?: 'image' | 'comic' | 'video';
    limit?: number;
    offset?: number;
  }) {
    const { colors, threshold = 0.8, limit = 50, offset = 0 } = options;
    const targets = colors.map((color) => ColorExtractor.rgbToHsl(color.r, color.g, color.b));
    const maxDistance = (1 - threshold) * 100;
    const matches = this.getCandidateRows(options)
      .map((row) => {
        const score = this.bestColorDistance(row, (entry) =>
          Math.min(...targets.map((target) => hslDistance(entry, target)))
        );
        return score === null || score > maxDistance ? null : { id: row.id, score };
      })
      .filter((match): match is { id: number; score: number } => match !== null)
      .sort((left, right) => left.score - right.score);

    const stackIds = matches.slice(offset, offset + limit).map((match) => match.id);
    return {
      stacks: this.getStacksInOrder(stackIds),
      total: matches.length,
      limit,
      offset,
    };
  }

  searchByColorFilter(options: StandaloneColorFilterOptions) {
    const { limit = 50, offset = 0 } = options;
    const matchedIds = this.getMatchingStackIdsByFilter(options);
    const stackIds = matchedIds.slice(offset, offset + limit);
    return {
      stacks: this.getStacksInOrder(stackIds),
      total: matchedIds.length,
      limit,
      offset,
    };
  }

  getMatchingStackIdsByFilter(options: StandaloneColorFilterOptions) {
    const matches = this.getCandidateRows(options)
      .map((row) => {
        const colors = parseDominantColors(row.dominant_colors_json).slice(0, 3);
        let bestScore: number | null = null;
        for (const color of colors) {
          const score = this.getColorMatchScore(color, options);
          if (score === null) continue;
          bestScore = bestScore === null ? score : Math.min(bestScore, score);
        }
        return bestScore === null ? null : { id: row.id, score: bestScore };
      })
      .filter((result): result is { id: number; score: number } => result !== null)
      .sort((left, right) => left.score - right.score);

    return matches.map((result) => result.id);
  }

  updateStackColors(stackId: number) {
    const stack = this.db
      .prepare('SELECT id, dominant_colors_json FROM stacks WHERE id = ?')
      .get(stackId) as { id: number; dominant_colors_json: string | null } | undefined;
    if (!stack) return null;

    const assetRows = this.db
      .prepare(
        'SELECT dominant_colors_json FROM assets WHERE stack_id = ? ORDER BY order_in_stack ASC, id ASC'
      )
      .all(stackId) as AssetColorRow[];
    const colorSets = assetRows
      .map((row) => parseDominantColors(row.dominant_colors_json))
      .filter((colors) => colors.length > 0);

    if (colorSets.length === 0) {
      const existing = parseDominantColors(stack.dominant_colors_json);
      return existing.length > 0 ? existing : null;
    }

    const colors = ColorExtractor.aggregateStackColors(colorSets);
    this.db
      .prepare('UPDATE stacks SET dominant_colors_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(colors), new Date().toISOString(), stackId);
    return colors;
  }

  getDatasetUpdateCandidateCount(datasetId: number) {
    return this.getDatasetUpdateCandidateStackIds(datasetId).length;
  }

  getDatasetUpdateCandidateStackIds(datasetId: number) {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT s.id AS id
         FROM stacks s
         JOIN assets a ON a.stack_id = s.id
         WHERE s.dataset_id = ?
           AND lower(a.file_type) IN ('jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm')
         ORDER BY s.id ASC`
      )
      .all(datasetId) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  getStats(dataSetId?: number) {
    const params: unknown[] = [];
    const where = dataSetId ? 'WHERE dataset_id = ?' : '';
    if (dataSetId) params.push(dataSetId);

    const totalStacks =
      (
        this.db.prepare(`SELECT COUNT(*) AS count FROM stacks ${where}`).get(...params) as
          | CountRow
          | undefined
      )?.count ?? 0;
    const totalWithColors =
      (
        this.db
          .prepare(
            `SELECT COUNT(*) AS count
           FROM stacks
           ${where}
           ${where ? 'AND' : 'WHERE'} dominant_colors_json IS NOT NULL
             AND dominant_colors_json <> ''
             AND dominant_colors_json <> '[]'`
          )
          .get(...params) as CountRow | undefined
      )?.count ?? 0;
    const totalWithoutColors = totalStacks - totalWithColors;
    const totalAssets =
      (dataSetId
        ? (this.db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM assets a
               JOIN stacks s ON s.id = a.stack_id
               WHERE s.dataset_id = ?`
            )
            .get(dataSetId) as CountRow | undefined)
        : (this.db.prepare('SELECT COUNT(*) AS count FROM assets').get() as CountRow | undefined)
      )?.count ?? 0;

    return {
      totalStacks,
      totalWithColors,
      totalWithoutColors,
      totalAssets,
      colorCoverage: totalStacks > 0 ? (totalWithColors / totalStacks) * 100 : 0,
    };
  }

  private getCandidateRows(options: { dataSetId?: number; mediaType?: string }) {
    const where: string[] = ['s.dominant_colors_json IS NOT NULL', "s.dominant_colors_json <> ''"];
    const params: unknown[] = [];
    if (options.dataSetId) {
      where.push('s.dataset_id = ?');
      params.push(options.dataSetId);
    }
    if (options.mediaType) {
      where.push('s.media_type = ?');
      params.push(options.mediaType);
    }
    return this.db
      .prepare(
        `SELECT s.id, s.dataset_id, s.media_type, s.dominant_colors_json
         FROM stacks s
         WHERE ${where.join(' AND ')}`
      )
      .all(...params) as StackColorRow[];
  }

  private bestColorDistance(row: StackColorRow, getDistance: (color: DominantColor) => number) {
    const colors = parseDominantColors(row.dominant_colors_json);
    if (colors.length === 0) return null;
    return Math.min(...colors.map(getDistance));
  }

  private getColorMatchScore(color: DominantColor, options: StandaloneColorFilterOptions) {
    const {
      hueCategories,
      hue,
      hex,
      tonePoint,
      toneTolerance = 20,
      similarityThreshold,
      customColor,
      saturationRange,
      lightnessRange,
    } = options;
    const target = getCustomColorTarget(customColor, tonePoint);
    const legacyHueTarget = getHueTarget(hue, hex);
    const hueScore = getHueCategoryMatchScore(color, hueCategories, similarityThreshold);

    if (hueCategories?.length && hueScore === null) return null;

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

    if (legacyHueTarget !== undefined) {
      const distance = hueDistance(color.hue, legacyHueTarget);
      return distance <= 30 ? distance : null;
    }

    if (saturationRange) {
      if (color.saturation < saturationRange.min || color.saturation > saturationRange.max) {
        return null;
      }
    }

    if (lightnessRange) {
      if (color.lightness < lightnessRange.min || color.lightness > lightnessRange.max) {
        return null;
      }
    }

    if (hueCategories?.length) return hueScore;
    if (saturationRange || lightnessRange) return 0;

    return null;
  }

  private getStacksInOrder(stackIds: number[]) {
    return stackIds
      .map((id) => this.stackRepository.getById(id))
      .filter((stack): stack is NonNullable<typeof stack> => Boolean(stack));
  }
}
