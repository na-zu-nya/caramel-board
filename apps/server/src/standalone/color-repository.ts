import type { DatabaseSync } from 'node:sqlite';
import { ColorExtractor, type DominantColor } from '../utils/colorExtractor';
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
  hueCategories?: string[];
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
    const { hueCategories, saturationRange, lightnessRange, limit = 50, offset = 0 } = options;
    const matches = this.getCandidateRows(options).filter((row) => {
      const colors = parseDominantColors(row.dominant_colors_json);
      return colors.some((color) => {
        if (hueCategories?.length && !hueCategories.includes(color.hueCategory)) return false;
        if (saturationRange) {
          if (color.saturation < saturationRange.min || color.saturation > saturationRange.max) {
            return false;
          }
        }
        if (lightnessRange) {
          if (color.lightness < lightnessRange.min || color.lightness > lightnessRange.max) {
            return false;
          }
        }
        return true;
      });
    });

    const stackIds = matches.slice(offset, offset + limit).map((row) => row.id);
    return {
      stacks: this.getStacksInOrder(stackIds),
      total: matches.length,
      limit,
      offset,
    };
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

  private getStacksInOrder(stackIds: number[]) {
    return stackIds
      .map((id) => this.stackRepository.getById(id))
      .filter((stack): stack is NonNullable<typeof stack> => Boolean(stack));
  }
}
