import type { DatabaseSync } from 'node:sqlite';
import { toPublicAssetPath, withPublicAssetArray } from '../../../utils/assetPath';
import { parseJsonObject } from '../sqlite';
import type { StackAssetService } from './asset-service';
import type { StackAutoTagReadService } from './auto-tag-read-service';
import {
  detectActualMediaTypeFromFileTypes,
  parseJsonArray,
  placeholders,
  toArray,
} from './helpers';
import type { StackMetadataService } from './metadata-service';
import type { CountRow, StackRow, StandaloneStackListParams } from './types';

export class StackQueryService {
  constructor(
    private db: DatabaseSync,
    private assetService: StackAssetService,
    private metadataService: StackMetadataService,
    private autoTagReadService: StackAutoTagReadService
  ) {}

  getPaginated(params: StandaloneStackListParams) {
    const sqlParams: Array<string | number> = [];
    const whereSql = this.buildStackWhere(params, sqlParams);
    const countRow = this.db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM stacks s
        LEFT JOIN authors a ON a.id = s.author_id
        WHERE ${whereSql}
      `)
      .get(...sqlParams) as CountRow | undefined;

    const rows = this.db
      .prepare(`${this.stackSelectSql(whereSql)} ORDER BY ${this.orderBy(params)} LIMIT ? OFFSET ?`)
      .all(...sqlParams, params.limit, params.offset) as StackRow[];

    return {
      stacks: rows.map((row) => this.toStack(row, { includeAssets: true })),
      total: countRow?.count ?? 0,
      limit: params.limit,
      offset: params.offset,
    };
  }

  getById(id: number, dataSetId?: number) {
    const params: number[] = [id];
    const where = ['s.id = ?'];
    if (dataSetId !== undefined) {
      where.push('s.dataset_id = ?');
      params.push(dataSetId);
    }

    const row = this.db.prepare(this.stackSelectSql(where.join(' AND '))).get(...params) as
      | StackRow
      | undefined;

    return row ? this.toStack(row, { includeAssets: true, includeTags: true }) : null;
  }

  getStackIdsByDataset(dataSetId: number) {
    const rows = this.db
      .prepare('SELECT id FROM stacks WHERE dataset_id = ? ORDER BY id ASC')
      .all(dataSetId) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  stackBelongsToDataset(stackId: number, dataSetId: number) {
    return Boolean(
      this.db
        .prepare('SELECT id FROM stacks WHERE id = ? AND dataset_id = ?')
        .get(stackId, dataSetId)
    );
  }

  private buildStackWhere(params: StandaloneStackListParams, sqlParams: Array<string | number>) {
    const where = ['s.dataset_id = ?'];
    sqlParams.push(params.dataSetId);

    if (params.collection) {
      where.push(
        'EXISTS (SELECT 1 FROM collection_stacks cs WHERE cs.stack_id = s.id AND cs.collection_id = ?)'
      );
      sqlParams.push(params.collection);
    }

    if (params.stackIds) {
      if (params.stackIds.length === 0) {
        where.push('0 = 1');
      } else {
        where.push(`s.id IN (${placeholders(params.stackIds)})`);
        sqlParams.push(...params.stackIds);
      }
    }

    if (params.mediaCategory) {
      where.push('s.media_type = ?');
      sqlParams.push(params.mediaCategory);
    }

    if (params.mediaTypes?.length) {
      const mediaTypes = [...new Set(params.mediaTypes)];
      where.push(`s.actual_media_type IN (${placeholders(mediaTypes)})`);
      sqlParams.push(...mediaTypes);
    }

    const tags = toArray(params.tag).filter((tag) => tag.trim().length > 0);
    if (tags.length > 0) {
      where.push(`EXISTS (
        SELECT 1
        FROM stack_tags st
        JOIN tags t ON t.id = st.tag_id
        WHERE st.stack_id = s.id AND t.title IN (${placeholders(tags)})
      )`);
      sqlParams.push(...tags);
    }

    const authors = toArray(params.author).filter((author) => author.trim().length > 0);
    if (authors.length > 0) {
      where.push(`a.name IN (${placeholders(authors)})`);
      sqlParams.push(...authors);
    }

    if (params.fav === '1') {
      where.push('EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id)');
    } else if (params.fav === '0') {
      where.push('NOT EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id)');
    }

    if (params.liked === '1') {
      where.push('s.liked <> 0');
    } else if (params.liked === '0') {
      where.push('s.liked = 0');
    }

    if (params.hasNoTags) {
      where.push('NOT EXISTS (SELECT 1 FROM stack_tags st WHERE st.stack_id = s.id)');
    }

    if (params.hasNoAuthor) {
      where.push('s.author_id IS NULL');
    }

    const search = params.search?.trim();
    if (search) {
      const like = `%${search}%`;
      where.push(`(
        s.name LIKE ? COLLATE NOCASE OR
        a.name LIKE ? COLLATE NOCASE OR
        EXISTS (
          SELECT 1
          FROM author_links al
          WHERE al.author_id = s.author_id
            AND (
              al.external_id LIKE ? COLLATE NOCASE OR
              al.url LIKE ? COLLATE NOCASE
            )
        ) OR
        EXISTS (
          SELECT 1
          FROM stack_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.stack_id = s.id AND t.title LIKE ? COLLATE NOCASE
        ) OR
        s.id IN (
          SELECT DISTINCT scores.stack_id
          FROM stack_auto_tag_scores scores
          LEFT JOIN auto_tag_mappings m
            ON m.dataset_id = ?
           AND m.is_active = 1
           AND m.auto_tag_key = scores.tag_key COLLATE NOCASE
          WHERE scores.score >= ?
            AND (
              scores.tag_key LIKE ? COLLATE NOCASE OR
              m.display_name LIKE ? COLLATE NOCASE
            )
        )
      )`);
      sqlParams.push(like, like, like, like, like, params.dataSetId, 0.4, like, like);
    }

    return where.join(' AND ');
  }

  private stackSelectSql(whereSql: string) {
    return `
      SELECT
        s.id,
        s.dataset_id,
        s.author_id,
        a.name AS author_name,
        s.name,
        s.thumbnail,
        s.media_type,
        s.actual_media_type,
        s.liked,
        s.meta_json,
        s.dominant_colors_json,
        s.created_at,
        s.updated_at,
        COUNT(asset_count.id) AS asset_count,
        CASE WHEN EXISTS (SELECT 1 FROM stack_favorites sf WHERE sf.stack_id = s.id) THEN 1 ELSE 0 END AS is_favorite
      FROM stacks s
      LEFT JOIN authors a ON a.id = s.author_id
      LEFT JOIN assets asset_count ON asset_count.stack_id = s.id
      WHERE ${whereSql}
      GROUP BY s.id
    `;
  }

  private orderBy(params: StandaloneStackListParams) {
    const direction = params.order === 'asc' ? 'ASC' : 'DESC';
    switch (params.sort) {
      case 'dateAdded':
        return `s.created_at ${direction}, s.id ${direction}`;
      case 'name':
        return `s.name ${direction}, s.id DESC`;
      case 'likes':
        return `s.liked ${direction}, s.updated_at DESC`;
      case 'id':
        return `s.id ${direction}`;
      default:
        return `s.created_at ${direction}, s.id ${direction}`;
    }
  }

  private toStack(row: StackRow, options: { includeAssets?: boolean; includeTags?: boolean } = {}) {
    const assets = options.includeAssets
      ? this.assetService.getAssetsByStackId(row.id, row.dataset_id)
      : [];
    const tags = options.includeTags ? this.metadataService.getTagsByStackId(row.id) : undefined;
    const autoTags = this.autoTagReadService.getAutoTagsByStackId(row.id, row.dataset_id);
    const thumbnail = toPublicAssetPath(row.thumbnail || assets[0]?.thumbnail, row.dataset_id);
    const likeCount = Number(row.liked ?? 0);
    const isFavorite = row.is_favorite === 1;
    const actualMediaType =
      row.actual_media_type ??
      detectActualMediaTypeFromFileTypes(assets.map((asset) => asset.fileType ?? asset.mimeType));

    return {
      id: row.id,
      dataSetId: row.dataset_id,
      datasetId: String(row.dataset_id),
      authorId: row.author_id,
      author: row.author_name
        ? {
            id: row.author_id,
            name: row.author_name,
            links: this.metadataService.getAuthorLinks(row.author_id),
          }
        : null,
      name: row.name,
      thumbnail,
      mediaType: row.media_type,
      actualMediaType: actualMediaType ?? undefined,
      liked: likeCount,
      likeCount,
      meta: parseJsonObject(row.meta_json),
      dominantColors: parseJsonArray(row.dominant_colors_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updateAt: row.updated_at,
      assetCount: row.asset_count,
      assetsCount: row.asset_count,
      favorited: isFavorite,
      isFavorite,
      tags,
      autoTags,
      assets: withPublicAssetArray(assets, row.dataset_id),
    };
  }
}
