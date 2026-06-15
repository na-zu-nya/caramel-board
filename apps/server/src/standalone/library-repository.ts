import type { DatabaseSync } from 'node:sqlite';
import type {
  CollectionFolderQuery,
  CreateCollectionFolderInput,
  FolderTreeQuery,
  UpdateCollectionFolderInput,
} from '../models/CollectionFolderModel';
import type {
  CollectionQuery,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '../models/CollectionModel';
import { StandaloneColorRepository } from './color-repository';
import { getStandaloneSqlite, nowIso, parseJsonObject } from './sqlite';
import { type StandaloneStackListParams, StandaloneStackRepository } from './stack-repository';

interface CountRow {
  count: number;
}

interface DatasetRow {
  id: number;
  name: string;
  icon: string | null;
  theme_color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectionRow {
  id: number;
  dataset_id: number;
  folder_id: number | null;
  name: string;
  icon: string;
  description: string | null;
  type: 'SMART' | 'MANUAL' | 'SCRATCH';
  filter_config_json: string | null;
  created_at: string;
  updated_at: string;
  stack_count?: number;
}

interface CollectionFolderRow {
  id: number;
  dataset_id: number;
  parent_id: number | null;
  name: string;
  icon: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  child_count?: number;
  collection_count?: number;
}

interface CollectionStackRow {
  collection_id: number;
  stack_id: number;
  added_at: string;
  order_index: number;
}

interface NavigationPinRow {
  id: number;
  dataset_id: number;
  user_id: number;
  collection_id: number | null;
  type: 'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW' | 'FAVORITES' | 'LIKES';
  name: string;
  icon: string;
  media_type: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  collection_name: string | null;
  collection_icon: string | null;
  collection_type: string | null;
}

const parseJsonRecord = (value: string | null | undefined): Record<string, unknown> => {
  const parsed = parseJsonObject(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;

const toNumber = (value: unknown) => (typeof value === 'number' ? value : undefined);

const getSmartCollectionColorStackIds = (
  repository: StandaloneColorRepository,
  dataSetId: number,
  mediaType: 'image' | 'comic' | 'video' | undefined,
  colorFilter: unknown
) => {
  if (!isRecord(colorFilter)) return undefined;

  const hueCategories = toStringArray(colorFilter.hueCategories);
  const toneSaturation = toNumber(colorFilter.toneSaturation);
  const toneLightness = toNumber(colorFilter.toneLightness);
  const tonePoint =
    toneSaturation !== undefined && toneLightness !== undefined
      ? { saturation: toneSaturation, lightness: toneLightness }
      : undefined;
  const similarityThreshold = toNumber(colorFilter.similarityThreshold);
  const customColor =
    typeof colorFilter.customColor === 'string' ? colorFilter.customColor : undefined;
  const hasColorFilter =
    Boolean(hueCategories?.length) || Boolean(tonePoint) || Boolean(customColor);

  if (!hasColorFilter) return undefined;

  return repository.getMatchingStackIdsByFilter({
    dataSetId,
    mediaType,
    hueCategories,
    tonePoint,
    toneTolerance: toNumber(colorFilter.toneTolerance),
    similarityThreshold,
    customColor,
  });
};

export class StandaloneLibraryRepository {
  private stackRepository: StandaloneStackRepository;
  private colorRepository: StandaloneColorRepository;

  constructor(private db: DatabaseSync = getStandaloneSqlite()) {
    this.stackRepository = new StandaloneStackRepository(db);
    this.colorRepository = new StandaloneColorRepository(db);
  }

  private ensureUserId() {
    const existing = this.db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as
      | { id: number }
      | undefined;
    if (existing) return existing.id;

    const now = nowIso();
    const result = this.db
      .prepare('INSERT INTO users (name, role, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('Standalone User', 'super', now, now);
    return Number(result.lastInsertRowid);
  }

  private getDataset(dataSetId: number) {
    const row = this.db.prepare('SELECT * FROM datasets WHERE id = ?').get(dataSetId) as
      | DatasetRow
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      themeColor: row.theme_color,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private getFolderRow(id: number) {
    return this.db
      .prepare(
        `SELECT
           f.*,
           (SELECT COUNT(*) FROM collection_folders child WHERE child.parent_id = f.id) AS child_count,
           (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id) AS collection_count
         FROM collection_folders f
         WHERE f.id = ?`
      )
      .get(id) as CollectionFolderRow | undefined;
  }

  private getCollectionRow(id: number) {
    return this.db
      .prepare(
        `SELECT
           c.*,
           COUNT(cs.stack_id) AS stack_count
         FROM collections c
         LEFT JOIN collection_stacks cs ON cs.collection_id = c.id
         WHERE c.id = ?
         GROUP BY c.id`
      )
      .get(id) as CollectionRow | undefined;
  }

  private toCollection(row: CollectionRow, options: { includeStacks?: boolean } = {}) {
    const folder = row.folder_id ? this.getFolderRow(row.folder_id) : undefined;
    const collectionStacks = options.includeStacks
      ? this.getCollectionStackRows(row.id)
      : undefined;

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      type: row.type,
      dataSetId: row.dataset_id,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      filterConfig: parseJsonRecord(row.filter_config_json),
      dataSet: this.getDataset(row.dataset_id),
      folder: folder ? this.toFolder(folder, { includeRelations: false }) : null,
      collectionStacks,
      _count: {
        collectionStacks: Number(row.stack_count ?? collectionStacks?.length ?? 0),
      },
    };
  }

  private toFolder(
    row: CollectionFolderRow,
    options: { includeRelations?: boolean; includeCollections?: boolean } = {}
  ) {
    const includeRelations = options.includeRelations ?? true;
    const children = includeRelations
      ? this.getChildFolders(row.id, options.includeCollections)
      : [];
    const collections =
      includeRelations && options.includeCollections ? this.getCollectionsForFolder(row.id) : [];

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      dataSetId: row.dataset_id,
      parentId: row.parent_id,
      order: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dataSet: this.getDataset(row.dataset_id),
      parent: row.parent_id ? this.getFolder(row.parent_id, { includeRelations: false }) : null,
      children,
      collections,
      _count: {
        children: Number(row.child_count ?? children.length),
        collections: Number(row.collection_count ?? collections.length),
      },
    };
  }

  private toNavigationPin(row: NavigationPinRow) {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      icon: row.icon,
      order: row.sort_order,
      dataSetId: row.dataset_id,
      userId: row.user_id,
      collectionId: row.collection_id,
      mediaType: row.media_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      collection: row.collection_id
        ? {
            id: row.collection_id,
            name: row.collection_name,
            icon: row.collection_icon,
            type: row.collection_type,
          }
        : null,
    };
  }

  private getCollectionStackRows(collectionId: number) {
    const rows = this.db
      .prepare(
        `SELECT collection_id, stack_id, added_at, order_index
         FROM collection_stacks
         WHERE collection_id = ?
         ORDER BY order_index ASC, added_at ASC`
      )
      .all(collectionId) as CollectionStackRow[];

    return rows.map((row) => ({
      collectionId: row.collection_id,
      stackId: row.stack_id,
      addedAt: row.added_at,
      orderIndex: row.order_index,
      stack: this.stackRepository.getById(row.stack_id),
    }));
  }

  private getCollectionsForFolder(folderId: number) {
    const rows = this.db
      .prepare(
        `SELECT c.*, COUNT(cs.stack_id) AS stack_count
         FROM collections c
         LEFT JOIN collection_stacks cs ON cs.collection_id = c.id
         WHERE c.folder_id = ?
         GROUP BY c.id
         ORDER BY c.name ASC`
      )
      .all(folderId) as CollectionRow[];

    return rows.map((row) => this.toCollection(row));
  }

  private getChildFolders(parentId: number, includeCollections = false) {
    const rows = this.db
      .prepare(
        `SELECT
           f.*,
           (SELECT COUNT(*) FROM collection_folders child WHERE child.parent_id = f.id) AS child_count,
           (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id) AS collection_count
         FROM collection_folders f
         WHERE f.parent_id = ?
         ORDER BY f.sort_order ASC, f.created_at DESC`
      )
      .all(parentId) as CollectionFolderRow[];

    return rows.map((row) => this.toFolder(row, { includeCollections }));
  }

  getCollection(id: number, options: { includeStacks?: boolean } = {}) {
    const row = this.getCollectionRow(id);
    return row ? this.toCollection(row, options) : null;
  }

  getCollectionList(query: CollectionQuery) {
    const where = [];
    const params: unknown[] = [];

    if (query.dataSetId) {
      where.push('c.dataset_id = ?');
      params.push(query.dataSetId);
    }

    if (query.type) {
      where.push('c.type = ?');
      params.push(query.type);
    }

    if (query.folderId !== undefined) {
      if (query.folderId) {
        where.push('c.folder_id = ?');
        params.push(query.folderId);
      } else {
        where.push('c.folder_id IS NULL');
      }
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM collections c ${whereSql}`).get(...params) as
        | CountRow
        | undefined
    )?.count;

    const rows = this.db
      .prepare(
        `SELECT c.*, COUNT(cs.stack_id) AS stack_count
         FROM collections c
         LEFT JOIN collection_stacks cs ON cs.collection_id = c.id
         ${whereSql}
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, query.limit, query.offset) as CollectionRow[];

    return {
      collections: rows.map((row) => this.toCollection(row)),
      total: total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  createCollection(data: CreateCollectionInput) {
    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO collections
           (dataset_id, folder_id, name, icon, description, type, filter_config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.dataSetId,
        data.folderId ?? null,
        data.name,
        data.icon || '📂',
        data.description ?? null,
        data.type || 'MANUAL',
        data.type === 'SMART'
          ? JSON.stringify(data.filterConfig ?? {})
          : JSON.stringify(data.filterConfig ?? null),
        now,
        now
      );

    return this.getCollection(Number(result.lastInsertRowid));
  }

  updateCollection(id: number, data: UpdateCollectionInput) {
    if (!this.getCollectionRow(id)) return null;
    const updates = ['updated_at = ?'];
    const params: unknown[] = [nowIso()];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      params.push(data.icon);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      params.push(data.type);
    }
    if (data.folderId !== undefined) {
      updates.push('folder_id = ?');
      params.push(data.folderId);
    }
    if (data.filterConfig !== undefined) {
      updates.push('filter_config_json = ?');
      params.push(JSON.stringify(data.filterConfig));
    }

    this.db.prepare(`UPDATE collections SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    return this.getCollection(id);
  }

  deleteCollection(id: number) {
    const result = this.db.prepare('DELETE FROM collections WHERE id = ?').run(id);
    return result.changes > 0;
  }

  addStackToCollection(collectionId: number, stackId: number, orderIndex?: number) {
    if (!this.getCollectionRow(collectionId)) return { ok: false as const, reason: 'collection' };
    if (!this.stackRepository.getById(stackId)) return { ok: false as const, reason: 'stack' };
    const existing = this.db
      .prepare('SELECT 1 FROM collection_stacks WHERE collection_id = ? AND stack_id = ?')
      .get(collectionId, stackId);
    if (existing) return { ok: false as const, reason: 'duplicate' };

    const nextOrder =
      orderIndex ??
      ((
        this.db
          .prepare(
            'SELECT MAX(order_index) AS max_order FROM collection_stacks WHERE collection_id = ?'
          )
          .get(collectionId) as { max_order: number | null } | undefined
      )?.max_order ?? 0) + 1;
    this.db
      .prepare(
        'INSERT INTO collection_stacks (collection_id, stack_id, added_at, order_index) VALUES (?, ?, ?, ?)'
      )
      .run(collectionId, stackId, nowIso(), nextOrder);
    return { ok: true as const };
  }

  bulkAddStacksToCollection(collectionId: number, stackIds: number[]) {
    if (!this.getCollectionRow(collectionId)) return false;
    const maxOrder =
      (
        this.db
          .prepare(
            'SELECT MAX(order_index) AS max_order FROM collection_stacks WHERE collection_id = ?'
          )
          .get(collectionId) as { max_order: number | null } | undefined
      )?.max_order ?? 0;
    let index = 1;
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO collection_stacks (collection_id, stack_id, added_at, order_index) VALUES (?, ?, ?, ?)'
    );
    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      for (const stackId of stackIds) {
        insert.run(collectionId, stackId, now, maxOrder + index);
        index += 1;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return true;
  }

  getCollectionStacks(collectionId: number, limit: number, offset: number) {
    const rows = this.db
      .prepare(
        `SELECT collection_id, stack_id, added_at, order_index
         FROM collection_stacks
         WHERE collection_id = ?
         ORDER BY order_index ASC, added_at ASC
         LIMIT ? OFFSET ?`
      )
      .all(collectionId, limit, offset) as CollectionStackRow[];

    return rows.map((row) => ({
      stack: this.stackRepository.getById(row.stack_id),
      orderIndex: row.order_index,
    }));
  }

  getCollectionStackIds(collectionId: number) {
    const rows = this.db
      .prepare(
        `SELECT stack_id
         FROM collection_stacks
         WHERE collection_id = ?
         ORDER BY order_index ASC, added_at ASC`
      )
      .all(collectionId) as Array<{ stack_id: number }>;
    return rows.map((row) => row.stack_id);
  }

  removeStackFromCollection(collectionId: number, stackId: number) {
    this.db
      .prepare('DELETE FROM collection_stacks WHERE collection_id = ? AND stack_id = ?')
      .run(collectionId, stackId);
  }

  reorderStacksInCollection(
    collectionId: number,
    stackOrders: { stackId: number; orderIndex: number }[]
  ) {
    const update = this.db.prepare(
      'UPDATE collection_stacks SET order_index = ? WHERE collection_id = ? AND stack_id = ?'
    );
    this.db.exec('BEGIN');
    try {
      for (const { stackId, orderIndex } of stackOrders) {
        update.run(orderIndex, collectionId, stackId);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getSmartCollectionStacks(collectionId: number, limit: number, offset: number) {
    const collection = this.getCollectionRow(collectionId);
    if (!collection || collection.type !== 'SMART') return null;
    const filterConfig = parseJsonRecord(collection.filter_config_json);
    const mediaType =
      filterConfig.mediaType === 'image' ||
      filterConfig.mediaType === 'comic' ||
      filterConfig.mediaType === 'video'
        ? filterConfig.mediaType
        : undefined;
    const stackIds = getSmartCollectionColorStackIds(
      this.colorRepository,
      collection.dataset_id,
      mediaType,
      filterConfig.colorFilter
    );
    const params: StandaloneStackListParams = {
      dataSetId: collection.dataset_id,
      mediaType,
      tag: Array.isArray(filterConfig.tagIds)
        ? filterConfig.tagIds.map((value) => String(value))
        : undefined,
      author: Array.isArray(filterConfig.authorNames)
        ? filterConfig.authorNames.map((value) => String(value))
        : undefined,
      fav:
        typeof filterConfig.favorited === 'boolean'
          ? filterConfig.favorited
            ? '1'
            : '0'
          : undefined,
      liked: typeof filterConfig.liked === 'boolean' ? (filterConfig.liked ? '1' : '0') : undefined,
      hasNoTags: filterConfig.hasNoTags === true,
      hasNoAuthor: filterConfig.hasNoAuthor === true,
      search: typeof filterConfig.search === 'string' ? filterConfig.search : undefined,
      stackIds,
      sort: 'recommended',
      order: 'desc',
      limit,
      offset,
    };
    return this.stackRepository.getPaginated(params);
  }

  getFolder(
    id: number,
    options: { includeRelations?: boolean; includeCollections?: boolean } = {}
  ) {
    const row = this.getFolderRow(id);
    return row ? this.toFolder(row, options) : null;
  }

  getFolderList(query: CollectionFolderQuery) {
    const where = [];
    const params: unknown[] = [];

    if (query.dataSetId) {
      where.push('f.dataset_id = ?');
      params.push(query.dataSetId);
    }

    if (query.parentId !== undefined) {
      if (query.parentId) {
        where.push('f.parent_id = ?');
        params.push(query.parentId);
      } else {
        where.push('f.parent_id IS NULL');
      }
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM collection_folders f ${whereSql}`)
        .get(...params) as CountRow | undefined
    )?.count;
    const rows = this.db
      .prepare(
        `SELECT
           f.*,
           (SELECT COUNT(*) FROM collection_folders child WHERE child.parent_id = f.id) AS child_count,
           (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id) AS collection_count
         FROM collection_folders f
         ${whereSql}
         ORDER BY f.sort_order ASC, f.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, query.limit, query.offset) as CollectionFolderRow[];

    return {
      folders: rows.map((row) =>
        this.toFolder(row, { includeCollections: query.includeCollections })
      ),
      total: total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  createFolder(data: CreateCollectionFolderInput) {
    const order = data.order || this.nextFolderOrder(data.dataSetId, data.parentId ?? null);
    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO collection_folders
           (dataset_id, parent_id, name, icon, description, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.dataSetId,
        data.parentId ?? null,
        data.name,
        data.icon || '📁',
        data.description ?? null,
        order,
        now,
        now
      );
    return this.getFolder(Number(result.lastInsertRowid));
  }

  updateFolder(id: number, data: UpdateCollectionFolderInput) {
    if (!this.getFolderRow(id)) return null;
    const updates = ['updated_at = ?'];
    const params: unknown[] = [nowIso()];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      params.push(data.icon);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.parentId !== undefined) {
      updates.push('parent_id = ?');
      params.push(data.parentId);
    }
    if (data.order !== undefined) {
      updates.push('sort_order = ?');
      params.push(data.order);
    }

    this.db
      .prepare(`UPDATE collection_folders SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params, id);
    return this.getFolder(id);
  }

  deleteFolder(id: number) {
    const row = this.getFolderRow(id);
    if (!row) return { ok: false as const, reason: 'missing' };
    if (Number(row.child_count ?? 0) > 0 || Number(row.collection_count ?? 0) > 0) {
      return { ok: false as const, reason: 'not-empty' };
    }
    this.db.prepare('DELETE FROM collection_folders WHERE id = ?').run(id);
    return { ok: true as const };
  }

  getFolderTree(query: FolderTreeQuery) {
    const rows = this.db
      .prepare(
        `SELECT
           f.*,
           (SELECT COUNT(*) FROM collection_folders child WHERE child.parent_id = f.id) AS child_count,
           (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id) AS collection_count
         FROM collection_folders f
         WHERE f.dataset_id = ? AND f.parent_id IS NULL
         ORDER BY f.sort_order ASC`
      )
      .all(query.dataSetId) as CollectionFolderRow[];
    const folders = rows.map((row) =>
      this.toFolder(row, { includeCollections: query.includeCollections })
    );
    const rootCollections = query.includeCollections
      ? this.getRootCollections(query.dataSetId)
      : [];
    return { folders, rootCollections };
  }

  reorderFolders(folderOrders: { folderId: number; order: number }[]) {
    const update = this.db.prepare('UPDATE collection_folders SET sort_order = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      for (const { folderId, order } of folderOrders) {
        update.run(order, folderId);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  moveFolder(folderId: number, newParentId: number | null) {
    if (!this.getFolderRow(folderId)) return null;
    if (newParentId && this.isDescendant(folderId, newParentId)) {
      return { error: 'cycle' as const };
    }
    this.db
      .prepare('UPDATE collection_folders SET parent_id = ?, updated_at = ? WHERE id = ?')
      .run(newParentId, nowIso(), folderId);
    return this.getFolder(folderId);
  }

  getNavigationPins(dataSetId: number) {
    const userId = this.ensureUserId();
    const rows = this.db
      .prepare(
        `SELECT
           p.*,
           c.name AS collection_name,
           c.icon AS collection_icon,
           c.type AS collection_type
         FROM navigation_pins p
         LEFT JOIN collections c ON c.id = p.collection_id
         WHERE p.dataset_id = ? AND p.user_id = ?
         ORDER BY p.sort_order ASC`
      )
      .all(dataSetId, userId) as NavigationPinRow[];
    return rows.map((row) => this.toNavigationPin(row));
  }

  upsertNavigationPin(data: {
    type: 'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW' | 'FAVORITES' | 'LIKES';
    name: string;
    icon: string;
    order: number;
    dataSetId: number;
    collectionId?: number;
    mediaType?: string;
  }) {
    const userId = this.ensureUserId();
    const now = nowIso();
    const existing = this.db
      .prepare(
        `SELECT id FROM navigation_pins
         WHERE user_id = ?
           AND type = ?
           AND dataset_id = ?
           AND collection_id IS ?
           AND media_type IS ?`
      )
      .get(userId, data.type, data.dataSetId, data.collectionId ?? null, data.mediaType ?? null) as
      | { id: number }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          'UPDATE navigation_pins SET name = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?'
        )
        .run(data.name, data.icon, data.order, now, existing.id);
      return this.getNavigationPin(existing.id);
    }

    const result = this.db
      .prepare(
        `INSERT INTO navigation_pins
           (dataset_id, user_id, collection_id, type, name, icon, media_type, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.dataSetId,
        userId,
        data.collectionId ?? null,
        data.type,
        data.name,
        data.icon,
        data.mediaType ?? null,
        data.order,
        now,
        now
      );
    return this.getNavigationPin(Number(result.lastInsertRowid));
  }

  updateNavigationPin(id: number, data: { name?: string; icon?: string; order?: number }) {
    if (!this.getNavigationPin(id)) return null;
    const updates = ['updated_at = ?'];
    const params: unknown[] = [nowIso()];
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      params.push(data.icon);
    }
    if (data.order !== undefined) {
      updates.push('sort_order = ?');
      params.push(data.order);
    }
    this.db
      .prepare(`UPDATE navigation_pins SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params, id);
    return this.getNavigationPin(id);
  }

  updateNavigationPinOrder(pins: Array<{ id: number; order: number }>) {
    const userId = this.ensureUserId();
    const update = this.db.prepare(
      'UPDATE navigation_pins SET sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    );
    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      for (const pin of pins) {
        update.run(pin.order, now, pin.id, userId);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  deleteNavigationPin(id: number) {
    const userId = this.ensureUserId();
    const result = this.db
      .prepare('DELETE FROM navigation_pins WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return result.changes > 0;
  }

  private getRootCollections(dataSetId: number) {
    const rows = this.db
      .prepare(
        `SELECT c.*, COUNT(cs.stack_id) AS stack_count
         FROM collections c
         LEFT JOIN collection_stacks cs ON cs.collection_id = c.id
         WHERE c.dataset_id = ? AND c.folder_id IS NULL
         GROUP BY c.id
         ORDER BY c.name ASC`
      )
      .all(dataSetId) as CollectionRow[];
    return rows.map((row) => this.toCollection(row));
  }

  private nextFolderOrder(dataSetId: number, parentId: number | null) {
    const row = this.db
      .prepare(
        `SELECT MAX(sort_order) AS max_order
         FROM collection_folders
         WHERE dataset_id = ? AND parent_id IS ?`
      )
      .get(dataSetId, parentId) as { max_order: number | null } | undefined;
    return (row?.max_order ?? 0) + 1;
  }

  private isDescendant(folderId: number, ancestorId: number): boolean {
    if (folderId === ancestorId) return true;
    const row = this.db
      .prepare('SELECT parent_id FROM collection_folders WHERE id = ?')
      .get(ancestorId) as { parent_id: number | null } | undefined;
    if (!row?.parent_id) return false;
    return this.isDescendant(folderId, row.parent_id);
  }

  private getNavigationPin(id: number) {
    const row = this.db
      .prepare(
        `SELECT
           p.*,
           c.name AS collection_name,
           c.icon AS collection_icon,
           c.type AS collection_type
         FROM navigation_pins p
         LEFT JOIN collections c ON c.id = p.collection_id
         WHERE p.id = ?`
      )
      .get(id) as NavigationPinRow | undefined;
    return row ? this.toNavigationPin(row) : null;
  }
}
