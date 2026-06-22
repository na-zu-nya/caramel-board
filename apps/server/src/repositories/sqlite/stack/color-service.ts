import type { DatabaseSync } from 'node:sqlite';
import { DataStorage } from '../../../lib/DataStorage';
import { ColorExtractor, type DominantColor } from '../../../utils/colorExtractor';
import { nowIso } from '../sqlite';
import {
  isDominantColor,
  isImageExtension,
  isVideoExtension,
  parseJsonArray,
  toColorJson,
} from './helpers';

export class StackColorService {
  constructor(private db: DatabaseSync) {}

  async extractAssetColors(fileKey: string, thumbnailKey: string, ext: string) {
    try {
      if (isImageExtension(ext)) {
        return await ColorExtractor.extractDominantColors(DataStorage.getPath(fileKey), 3);
      }
      if (isVideoExtension(ext) && thumbnailKey) {
        return await ColorExtractor.extractDominantColors(DataStorage.getPath(thumbnailKey), 3);
      }
    } catch (error) {
      console.error('Failed to extract colors for standalone asset upload', error);
    }
    return null;
  }

  replaceAssetColors(assetId: number, colors: DominantColor[] | null) {
    this.db.prepare('DELETE FROM asset_colors WHERE asset_id = ?').run(assetId);
    if (!colors || colors.length === 0) return;
    const insert = this.db.prepare(
      `INSERT INTO asset_colors
         (asset_id, r, g, b, hex, percentage, hue, saturation, lightness, hue_category, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    colors.forEach((color, index) => {
      insert.run(
        assetId,
        color.r,
        color.g,
        color.b,
        color.hex,
        color.percentage,
        color.hue,
        color.saturation,
        color.lightness,
        color.hueCategory,
        index
      );
    });
  }

  replaceStackColors(stackId: number, colors: DominantColor[] | null) {
    this.db.prepare('DELETE FROM stack_colors WHERE stack_id = ?').run(stackId);
    if (!colors || colors.length === 0) return;
    const insert = this.db.prepare(
      `INSERT INTO stack_colors
         (stack_id, r, g, b, hex, percentage, hue, saturation, lightness, hue_category, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    colors.forEach((color, index) => {
      insert.run(
        stackId,
        color.r,
        color.g,
        color.b,
        color.hex,
        color.percentage,
        color.hue,
        color.saturation,
        color.lightness,
        color.hueCategory,
        index
      );
    });
  }

  refreshStackColors(stackId: number) {
    const rows = this.db
      .prepare(
        `SELECT dominant_colors_json
         FROM assets
         WHERE stack_id = ?
         ORDER BY order_in_stack ASC, id ASC`
      )
      .all(stackId) as Array<{ dominant_colors_json: string | null }>;
    const colorSets = rows
      .map((row) => parseJsonArray(row.dominant_colors_json).filter(isDominantColor))
      .filter((colors) => colors.length > 0);
    const colors = colorSets.length > 0 ? ColorExtractor.aggregateStackColors(colorSets) : null;
    this.db
      .prepare('UPDATE stacks SET dominant_colors_json = ?, updated_at = ? WHERE id = ?')
      .run(toColorJson(colors), nowIso(), stackId);
    this.replaceStackColors(stackId, colors);
  }
}
