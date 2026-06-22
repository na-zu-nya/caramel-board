import { toPublicAssetPath } from '../../../utils/assetPath';
import { parseJsonObject } from '../sqlite';
import { parseJsonArray } from './helpers';
import type { AssetRow } from './types';

export const toAsset = (row: AssetRow, dataSetId: number) => ({
  id: row.id,
  stackId: row.stack_id,
  file: toPublicAssetPath(row.file, dataSetId),
  thumbnail: toPublicAssetPath(row.thumbnail, dataSetId),
  preview: row.preview ? toPublicAssetPath(row.preview, dataSetId) : null,
  fileType: row.file_type,
  mimeType: row.file_type,
  originalName: row.original_name,
  hash: row.hash,
  orderInStack: row.order_in_stack,
  meta: parseJsonObject(row.meta_json),
  dominantColors: parseJsonArray(row.dominant_colors_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  favorited: row.is_favorite === 1,
  isFavorite: row.is_favorite === 1,
});
