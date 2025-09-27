import fs from 'node:fs';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DuplicateAssetError } from '../../../errors/DuplicateAssetError';
import { AssetModel } from '../../../models/AssetModel';
import { ensureSuperUser } from '../../../shared/services/UserService';
import { toPublicAssetPath, withPublicAssetArray } from '../../../utils/assetPath';
import {
  buildUnifiedWhereClause,
  combineStackIdConstraints,
  extractColorFilterOptions,
  hasColorFilter,
  type StackIdConstraints,
  type UnifiedFilterOptions,
} from '../../../utils/filterBuilder';
import { getHash } from '../../../utils/functions';
import { generateMediaPreview, shouldGeneratePreview } from '../../../utils/generateMediaPreview';
import { generateThumbnail } from '../../../utils/generateThumbnail';
import { formatStacksThumbnails } from '../../../utils/thumbnailPath';
import type { createColorSearchService } from './color-search-service';
import type { ColorFilter as SearchColorFilter } from './search-service';

type StackAsset = {
  file?: string | null;
  thumbnail?: string | null;
};

const normalizeAssets = (assets: unknown, dataSetId: number | undefined) => {
  if (!Array.isArray(assets)) return [] as StackAsset[];
  const filtered = assets.filter((asset): asset is StackAsset => {
    if (!asset || typeof asset !== 'object') return false;
    return true;
  });
  return withPublicAssetArray(filtered, dataSetId);
};

type AutoTagAggregateEntry = {
  tag?: string;
  score?: number;
};

const extractAutoTagEntries = (
  value: Prisma.JsonValue | null | undefined
): AutoTagAggregateEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'object' && entry !== null ? entry : null))
    .filter((entry): entry is AutoTagAggregateEntry => entry !== null);
};

export interface CreateStackData {
  name: string;
  mediaType?: string;
  thumbnail?: string;
}

export interface CreateStackWithFileData {
  name: string;
  mediaType?: string;
  tags?: string[];
  author?: string;
  file: {
    path: string;
    originalname: string;
    mimetype: string;
    size: number;
  };
}

export interface UpdateStackData {
  name?: string;
  thumbnail?: string;
  meta?: Record<string, unknown>;
}

export interface StackOptions {
  assets?: boolean;
  tags?: boolean;
  author?: boolean;
  collections?: boolean;
}

interface SearchWithRankingOptions {
  query: string;
  limit: number;
  offset: number;
  sort?: string;
  order?: string;
  filters?: {
    mediaType?: string;
    favorited?: boolean;
    liked?: number;
    tag?: string | string[];
    author?: string;
    collection?: number;
    autoTag?: string | string[];
    colorFilter?: SearchColorFilter;
  };
}

export interface PaginationOptions {
  limit: number;
  offset: number;
  mediaType?: string;
}

export interface FilterOptions {
  limit: number;
  offset: number;
  mediaType?: string;
  tag?: string | string[];
  author?: string;
  fav?: number;
  liked?: number;
  sort?: 'id' | 'name' | 'createdAt' | 'updateAt' | 'liked' | 'recommended';
  order?: 'asc' | 'desc';
  collection?: number;
  // 色域フィルタ
  hueCategories?: string | string[];
  toneSaturation?: number;
  toneLightness?: number;
  toneTolerance?: number;
  similarityThreshold?: number;
  customColor?: string;
  // AutoTag filter
  autoTag?: string | string[];
  // Text search
  search?: string;
}

export const createStackService = (deps: {
  prisma: PrismaClient;
  colorSearch: ReturnType<typeof createColorSearchService>;
  dataSetId: number;
}) => {
  const { prisma, colorSearch, dataSetId } = deps;

  async function annotateFavorites<T extends { id: number }>(
    stacks: T[]
  ): Promise<Array<T & { favorited: boolean; isFavorite: boolean }>> {
    if (stacks.length === 0) {
      return stacks.map((stack) => ({
        ...stack,
        favorited: false,
        isFavorite: false,
      }));
    }

    const userId = await ensureSuperUser(prisma);
    const favoriteRows = await prisma.stackFavorite.findMany({
      where: {
        userId,
        stackId: {
          in: stacks.map((stack) => Number(stack.id)),
        },
      },
      select: { stackId: true },
    });
    const favoriteSet = new Set(favoriteRows.map((row) => row.stackId));

    return stacks.map((stack) => {
      const isFavorite = favoriteSet.has(Number(stack.id));
      return {
        ...stack,
        favorited: isFavorite,
        isFavorite,
      };
    });
  }

  async function getAll(pagination: PaginationOptions) {
    const { limit, offset, mediaType } = pagination;

    const where: Prisma.StackWhereInput = { dataSetId };
    if (mediaType) {
      where.mediaType = mediaType;
    }

    const [stacksRaw, total] = await Promise.all([
      prisma.stack.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assets: {
            take: 1,
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: { assets: true },
          },
        },
      }),
      prisma.stack.count({ where }),
    ]);

    const stacks = stacksRaw.map((stack) => {
      const publicAssets = normalizeAssets(stack.assets, stack.dataSetId);
      return {
        ...stack,
        assets: publicAssets,
        thumbnail: toPublicAssetPath(stack.thumbnail, stack.dataSetId),
      };
    });

    const normalizedStacks = stacks.map((stack) => {
      const firstAsset = stack.assets[0];
      const thumbnail = firstAsset?.thumbnail || stack.thumbnail || '';
      return {
        ...stack,
        thumbnail: thumbnail ? `/${thumbnail}` : '',
        assetCount: stack._count.assets,
      };
    });

    const stacksWithFavorites = await annotateFavorites(normalizedStacks);

    return {
      stacks: stacksWithFavorites,
      total,
      limit,
      offset,
    };
  }

  async function getAllWithFilters(filters: FilterOptions) {
    const {
      limit,
      offset,
      mediaType,
      tag,
      author,
      fav,
      liked,
      sort,
      order,
      collection,
      hueCategories,
      toneSaturation,
      toneLightness,
      toneTolerance,
      similarityThreshold,
      customColor,
      autoTag,
      search,
    } = filters;

    // Determine effective sort: default to 'recommended' if not specified
    const effectiveSort = sort || 'recommended';

    const userId = await ensureSuperUser(prisma);
    const favoriteFilter =
      fav === undefined
        ? undefined
        : fav === 1
          ? {
              some: {
                userId,
              },
            }
          : {
              none: {
                userId,
              },
            };

    // ID制約を収集
    const idConstraints: StackIdConstraints = {};

    // 1. フリーワード検索
    if (search?.trim()) {
      // 基本Whereクラウスを構築（検索時にも他のフィルタを適用）
      const baseWhere: Prisma.StackWhereInput = {
        dataSetId,
        ...(mediaType ? { mediaType } : {}),
        ...(liked !== undefined ? { liked: liked ? { gt: 0 } : 0 } : {}),
      };
      if (favoriteFilter) {
        baseWhere.favorites = favoriteFilter;
      }

      // タグ・著者・コレクションフィルタも追加
      if (tag) {
        const tags = Array.isArray(tag) ? tag : [tag];
        baseWhere.tags = {
          some: {
            tag: {
              title: {
                in: tags,
              },
            },
          },
        };
      }
      if (author) {
        baseWhere.author = {
          name: {
            contains: author,
            mode: 'insensitive',
          },
        };
      }
      if (collection) {
        baseWhere.collectionStacks = {
          some: {
            collectionId: collection,
          },
        };
      }

      // 統合検索を実行
      console.log(`Executing unified search for: "${search.trim()}" in dataset ${dataSetId}`);
      const searchResults = await performUnifiedSearch(search.trim(), baseWhere);

      // 検索結果をID制約に追加
      const allSearchIds = new Set([
        ...searchResults.textMatches,
        ...searchResults.tagMatches,
        ...searchResults.autoTagMatches,
      ]);

      console.log(`Total search IDs found: ${allSearchIds.size}`);

      if (allSearchIds.size > 0) {
        idConstraints.search = Array.from(allSearchIds);
      } else {
        // 検索結果が0件の場合は早期リターン
        console.log('No search results found, returning empty result');
        return {
          stacks: [],
          total: 0,
          limit,
          offset,
        };
      }
    }

    // 2. 色フィルタ
    const colorFilter = {
      hueCategories: hueCategories
        ? Array.isArray(hueCategories)
          ? hueCategories
          : [hueCategories]
        : undefined,
      toneSaturation,
      toneLightness,
      toneTolerance,
      similarityThreshold,
      customColor,
    };

    if (hasColorFilter({ colorFilter })) {
      // 追加のWhere条件を構築
      const additionalWhere: Prisma.StackWhereInput = {
        ...(mediaType ? { mediaType } : {}),
        ...(liked !== undefined ? { liked: liked ? { gt: 0 } : 0 } : {}),
      };
      if (favoriteFilter) {
        additionalWhere.favorites = favoriteFilter;
      }

      const colorStackIds = await colorSearch.getColorMatchingStackIds({
        ...colorFilter,
        additionalWhere,
      });

      if (colorStackIds.length > 0) {
        idConstraints.color = colorStackIds;
      } else if (!search) {
        // 色フィルタが指定されているが結果が0件の場合（検索がない場合のみ）
        return {
          stacks: [],
          total: 0,
          limit,
          offset,
        };
      }
    }

    // 3. AutoTagフィルタ
    if (autoTag) {
      const autoTags = Array.isArray(autoTag) ? autoTag : [autoTag];

      // AutoTagPredictionから直接検索
      const predictionQuery = `
          SELECT DISTINCT ast."stackId"
          FROM "AutoTagPrediction" atp
                   INNER JOIN "Asset" ast ON ast.id = atp."assetId"
                   INNER JOIN "Stack" s ON s.id = ast."stackId"
          WHERE s."dataSetId" = $1
            AND EXISTS (SELECT 1
                        FROM jsonb_each_text(atp."scores") AS score
                        WHERE score.key = ANY ($2::text[])
                          AND score.value::float >= atp."threshold")
      `;

      const predictionResult = await prisma.$queryRawUnsafe<{ stackId: number }[]>(
        predictionQuery,
        dataSetId,
        autoTags
      );

      const autoTagStackIds = predictionResult.map((r) => r.stackId);

      if (autoTagStackIds.length > 0) {
        idConstraints.autoTag = autoTagStackIds;
      } else if (!search && !hasColorFilter({ colorFilter })) {
        // AutoTagフィルタが指定されているが結果が0件の場合
        return {
          stacks: [],
          total: 0,
          limit,
          offset,
        };
      }
    }

    // 4. すべてのID制約を統合
    const combinedStackIds = combineStackIdConstraints(idConstraints);

    // 5. 統合フィルタオプションを構築
    const unifiedOptions: UnifiedFilterOptions = {
      dataSetId,
      mediaType,
      tags: tag ? (Array.isArray(tag) ? tag : [tag]) : undefined,
      authors: author ? [author] : undefined,
      favorited: fav === 1 ? true : fav === 0 ? false : undefined,
      liked: liked ? true : undefined,
      collection,
      // ID制約がある場合のみ追加
      ...(combinedStackIds.length > 0
        ? {
            colorStackIds: idConstraints.color,
            autoTagIds: idConstraints.autoTag,
            searchStackIds: idConstraints.search,
          }
        : {}),
    };

    // 6. 統合Whereクラウスを構築
    const where = buildUnifiedWhereClause(unifiedOptions, userId);

    // 7. ソート順の決定 - 検索時はデータ取得後にJavaScriptでソート
    let orderBy: Prisma.StackOrderByWithRelationInput = { createdAt: 'desc' };
    let searchRankedIds: number[] = [];

    if (effectiveSort === 'recommended' && search) {
      // 検索時のランキング順IDを保存（後でJavaScriptソートで使用）
      const rankedResults = rankSearchResults(
        search
          ? await performUnifiedSearch(search.trim(), where)
          : {
              textMatches: new Set<number>(),
              tagMatches: new Set<number>(),
              autoTagMatches: new Set<number>(),
            },
        idConstraints.color ? new Set(idConstraints.color) : undefined
      );

      searchRankedIds = rankedResults.map((r) => r.id);
      // 普通のorderByを使用（後でJavaScriptで並び替え）
      orderBy = { createdAt: 'desc' };
    } else if (effectiveSort !== 'recommended') {
      const sortOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';
      switch (effectiveSort) {
        case 'updateAt':
          orderBy = { updateAt: sortOrder };
          break;
        case 'name':
          orderBy = { name: sortOrder };
          break;
        case 'liked':
          orderBy = { liked: sortOrder };
          break;
        case 'id':
          orderBy = { id: sortOrder };
          break;
        case 'createdAt':
          orderBy = { createdAt: sortOrder };
          break;
        default:
          orderBy = { createdAt: 'desc' };
      }
    }

    // 8. データ取得
    const [stacksRaw, total] = await Promise.all([
      prisma.stack.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
        select: {
          id: true,
          name: true,
          thumbnail: true,
          createdAt: true,
          updateAt: true,
          meta: true,
          mediaType: true,
          liked: true,
          authorId: true,
          dataSetId: true,
          dominantColors: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
          assets: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              thumbnail: true,
            },
          },
          _count: {
            select: {
              assets: true,
              tags: true,
            },
          },
        },
      }),
      prisma.stack.count({ where }),
    ]);

    const stacks = stacksRaw.map((stack) => ({
      ...stack,
      assets: normalizeAssets(stack.assets, stack.dataSetId),
      thumbnail: toPublicAssetPath(stack.thumbnail, stack.dataSetId),
    }));

    // 9. タグデータを取得
    const stackIds = stacks.map((s) => s.id);
    const tagsData =
      stackIds.length > 0
        ? await prisma.tagsOnStack.findMany({
            where: {
              stackId: { in: stackIds },
            },
            select: {
              stackId: true,
              tag: {
                select: {
                  title: true,
                },
              },
            },
          })
        : [];

    // タグをスタックIDでグループ化
    const tagsByStackId = new Map<number, string[]>();
    for (const tagData of tagsData) {
      if (!tagsByStackId.has(tagData.stackId)) {
        tagsByStackId.set(tagData.stackId, []);
      }
      tagsByStackId.get(tagData.stackId)!.push(tagData.tag.title);
    }

    // 10. 検索時のランキングソートを適用
    let sortedStacks = stacks;
    if (searchRankedIds.length > 0) {
      // ランキング順でソート
      const rankMap = new Map(searchRankedIds.map((id, index) => [id, index]));
      sortedStacks = stacks.sort((a, b) => {
        const rankA = rankMap.get(a.id) ?? 999999;
        const rankB = rankMap.get(b.id) ?? 999999;
        return rankA - rankB;
      });
    }

    // 11. 結果をフォーマット
    const formattedStacks = formatStacksThumbnails(
      sortedStacks
        .map((stack) => {
          // デバッグ用ログ
          if (!stack) {
            console.error('Stack is undefined:', stack);
            return null;
          }
          if (!stack.assets) {
            console.error('Stack assets is undefined:', stack.id, stack);
            return null;
          }

          const firstAsset = stack.assets[0];
          const thumbnail = firstAsset?.thumbnail || stack.thumbnail || '';
          return {
            ...stack,
            thumbnail,
            assetCount: stack._count.assets,
            tags: tagsByStackId.get(stack.id) || [],
            author: stack.author?.name || '',
          };
        })
        .filter(Boolean)
    );

    const stacksWithFavorites = await annotateFavorites(formattedStacks);

    return {
      stacks: stacksWithFavorites,
      total,
      limit,
      offset,
    };
  }

  async function getById(id: number, options: StackOptions = {}) {
    const { assets = true, tags = true, author = true, collections = false } = options;

    const stack = await prisma.stack.findFirst({
      where: { id, dataSetId },
      include: {
        assets: assets
          ? {
              orderBy: {
                orderInStack: 'asc',
              },
            }
          : false,
        author: author,
        tags: tags
          ? {
              include: {
                tag: true,
              },
            }
          : false,
        collectionStacks: collections
          ? {
              include: {
                collection: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                  },
                },
              },
            }
          : false,
        autoTagAggregate: true,
        // embeddings removed
      },
    });

    if (!stack) {
      return null;
    }

    // Transform tags to match existing format
    const normalizedAssetsList = normalizeAssets(stack.assets, stack.dataSetId);

    let autoTags:
      | Array<{
          autoTagKey: string;
          displayName: string;
          mappedTag: { id: number; title: string } | null;
          score?: number;
        }>
      | undefined;

    const autoTagEntries = extractAutoTagEntries(stack.autoTagAggregate?.topTags);
    const autoTagKeys = autoTagEntries
      .map((entry) => entry.tag)
      .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);

    if (autoTagKeys.length > 0) {
      const mappings = await prisma.autoTagMapping.findMany({
        where: {
          dataSetId,
          autoTagKey: { in: autoTagKeys },
          isActive: true,
        },
        include: {
          tag: true,
        },
      });

      const mappingMap = new Map(mappings.map((mapping) => [mapping.autoTagKey, mapping]));

      const mappedEntries = autoTagEntries
        .map((entry) => {
          if (!entry.tag) return null;
          const mapping = mappingMap.get(entry.tag);
          return {
            autoTagKey: entry.tag,
            displayName: mapping?.displayName ?? entry.tag,
            mappedTag: mapping?.tag ? { id: mapping.tag.id, title: mapping.tag.title } : null,
            score: entry.score,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (mappedEntries.length > 0) {
        autoTags = mappedEntries;
      }
    }

    const thumbnailSource = normalizedAssetsList[0]?.thumbnail || stack.thumbnail || '';
    const thumbnail = toPublicAssetPath(thumbnailSource, stack.dataSetId);

    const transformedStack = {
      ...stack,
      ...(tags
        ? {
            tags: stack.tags.map((relation) => relation?.tag.title),
          }
        : {}),
      ...(assets ? { assets: normalizedAssetsList } : {}),
      ...(autoTags ? { autoTags } : {}),
      thumbnail,
    };

    const [annotatedStack] = await annotateFavorites([transformedStack]);
    return annotatedStack;
  }

  async function create(data: CreateStackData) {
    return prisma.stack.create({
      data: {
        name: data.name,
        mediaType: data.mediaType ?? 'image',
        thumbnail: data.thumbnail || '',
        meta: {},
        dataSetId,
      },
    });
  }

  async function createWithFile(data: CreateStackWithFileData) {
    // 1) 事前に重複を検知（空スタック生成を防ぐ）
    const hash = await getHash(data.file.path);
    const existing = await prisma.asset.findFirst({
      where: { hash, stack: { dataSetId } },
      select: { id: true, stackId: true },
    });
    if (existing) {
      // tmpファイルを掃除
      try {
        fs.rmSync(data.file.path);
      } catch {}
      throw new DuplicateAssetError('重複画像のため作成できません', {
        assetId: existing.id,
        stackId: existing.stackId,
        scope: 'dataset',
      });
    }

    // 2) スタック作成→アセット作成
    const stack = await prisma.stack.create({
      data: {
        name: data.name,
        mediaType: data.mediaType ?? 'image',
        thumbnail: '',
        meta: {},
        dataSetId,
      },
    });

    await AssetModel.createWithFile(data.file.path, data.file.originalname, stack.id, dataSetId);

    return getById(stack.id, { assets: true });
  }

  async function update(id: number, data: UpdateStackData) {
    return prisma.stack.update({
      where: { id },
      data,
    });
  }

  async function deleteStack(id: number) {
    // 対象のスタックがこのデータセットに属しているか確認
    const stack = await prisma.stack.findFirst({
      where: { id, dataSetId },
    });

    if (!stack) {
      throw new Error('Stack not found in this dataset');
    }

    // Delete related assets first
    const _assets = await prisma.asset.findMany({
      where: { stackId: id },
    });

    // TODO: Delete actual files from storage

    return prisma.stack.delete({
      where: { id },
    });
  }

  /**
   * 統合検索 - フリーワード検索とフィルタを統合的に処理
   */
  async function performUnifiedSearch(
    query: string,
    baseWhere: Prisma.StackWhereInput
  ): Promise<{
    textMatches: Set<number>;
    tagMatches: Set<number>;
    autoTagMatches: Set<number>;
  }> {
    console.log('performUnifiedSearch called with:', {
      query,
      dataSetId,
      baseWhere,
    });
    const [nameMatches, tagSearchResults, _autoTagMappings] = await Promise.all([
      // スタック名での検索
      query &&
        prisma.stack.findMany({
          where: {
            ...baseWhere,
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        }),

      // タグ名での検索
      (async () => {
        try {
          return await prisma.tagsOnStack.findMany({
            where: {
              tag: {
                title: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
              stack: {
                dataSetId,
                ...(baseWhere.mediaType ? { mediaType: baseWhere.mediaType } : {}),
                ...(favoriteFilter ? { favorites: favoriteFilter } : {}),
                ...(baseWhere.liked !== undefined ? { liked: baseWhere.liked } : {}),
              },
            },
            select: { stackId: true },
          });
        } catch (error) {
          console.error('Tag search failed:', error);
          return [];
        }
      })(),

      // AutoTagMappingでの検索（表示名と紐付けタグ）
      prisma.autoTagMapping.findMany({
        where: {
          dataSetId,
          isActive: true,
          OR: [
            {
              displayName: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              tag: {
                title: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            },
            {
              autoTagKey: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          autoTagKey: true,
        },
      }),
    ]);

    // AutoTagでマッチするスタックを検索（一時的に無効化）
    const autoTagStackIds: number[] = [];
    console.log('AutoTag search temporarily disabled for debugging');

    const results = {
      textMatches: new Set(nameMatches.map((s) => s.id)),
      tagMatches: new Set(tagSearchResults.map((t) => t.stackId)),
      autoTagMatches: new Set(autoTagStackIds),
    };

    // Debug log for search results
    console.log(`Search results for "${query}":`, {
      textMatches: results.textMatches.size,
      tagMatches: results.tagMatches.size,
      autoTagMatches: results.autoTagMatches.size,
      // embeddings/clip removed
    });

    return results;
  }

  /**
   * Enhanced search with ranking algorithm
   */
  async function searchWithRanking(options: SearchWithRankingOptions) {
    const { query, limit, offset, sort, order, filters } = options;

    const userId = await ensureSuperUser(prisma);

    console.log('searchWithRanking called with:', {
      query,
      dataSetId,
      filters,
    });

    // Build base where clause for filters
    const baseWhere: Prisma.StackWhereInput = {
      dataSetId,
    };

    if (filters?.mediaType) baseWhere.mediaType = filters.mediaType;
    if (filters?.favorited !== undefined) {
      baseWhere.favorites = filters.favorited
        ? {
            some: {
              userId,
            },
          }
        : {
            none: {
              userId,
            },
          };
    }
    if (filters?.liked !== undefined && filters.liked > 0) {
      baseWhere.liked = { gte: filters.liked };
    }

    // Tag filter
    if (filters?.tag) {
      const tags = Array.isArray(filters.tag) ? filters.tag : [filters.tag];
      console.log('Applying tag filter:', tags);
      baseWhere.tags = {
        some: {
          tag: {
            title: {
              in: tags,
            },
          },
        },
      };
    }

    // Author filter
    if (filters?.author) {
      baseWhere.author = {
        name: {
          contains: filters.author,
          mode: 'insensitive',
        },
      };
    }

    // Collection filter
    if (filters?.collection) {
      baseWhere.collectionStacks = {
        some: {
          collectionId: filters.collection,
        },
      };
    }

    // Handle color filter separately if present
    let colorFilteredStackIds: number[] | undefined;
    if (filters?.colorFilter && hasColorFilter({ colorFilter: filters.colorFilter })) {
      const colorFilterOptions = extractColorFilterOptions(
        { colorFilter: filters.colorFilter, favorited: filters.favorited },
        dataSetId,
        10000, // Get all matching stacks for filtering
        0,
        userId
      );

      if (colorFilterOptions) {
        const colorResults = await colorSearch.searchByColorFilter(colorFilterOptions);
        colorFilteredStackIds = colorResults.stacks.map((stack) => stack.id);

        // Add color filter to base where clause
        if (colorFilteredStackIds.length > 0) {
          baseWhere.id = { in: colorFilteredStackIds };
        } else {
          // No color matches, return empty result
          return {
            stacks: [],
            total: 0,
            limit,
            offset,
          };
        }
      }
    }

    // Run all searches in parallel for better performance
    const [tagMatches, exactNameMatches, prefixMatches, autoTagMappings] = await Promise.all([
      // Search exact tag matches
      prisma.tagsOnStack.findMany({
        where: {
          tag: {
            title: {
              equals: query,
              mode: 'insensitive',
            },
          },
          stack: {
            dataSetId,
            ...(baseWhere.mediaType ? { mediaType: baseWhere.mediaType } : {}),
            ...(favoriteFilter ? { favorites: favoriteFilter } : {}),
            ...(baseWhere.liked !== undefined ? { liked: baseWhere.liked } : {}),
          },
        },
        select: {
          stackId: true,
        },
      }),

      // Search for exact name matches
      prisma.stack.findMany({
        where: {
          ...baseWhere,
          name: {
            equals: query,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      }),

      // Search for prefix matches
      prisma.stack.findMany({
        where: {
          ...baseWhere,
          name: {
            startsWith: query,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      }),

      // Search AutoTagMappings that might match the query
      prisma.autoTagMapping.findMany({
        where: {
          dataSetId,
          isActive: true,
          OR: [
            {
              // Search by display name (Japanese)
              displayName: {
                equals: query,
                mode: 'insensitive',
              },
            },
            {
              // Search by linked tag title
              tag: {
                title: {
                  equals: query,
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
        select: {
          autoTagKey: true,
          tagId: true,
        },
      }),
    ]);

    const tagMatchStackIds = tagMatches.map((t) => t.stackId);
    const exactNameStackIds = exactNameMatches.map((s) => s.id);
    const prefixStackIds = prefixMatches
      .filter((s) => !exactNameStackIds.includes(s.id))
      .map((s) => s.id);

    // Process AutoTagMapping results to find stacks
    const autoTagMatchStackIds: number[] = [];
    const mappedAutoTagKeys = autoTagMappings.map((mapping) => mapping.autoTagKey);

    if (mappedAutoTagKeys.length > 0) {
      // Find stacks that have these auto tags
      const autoTagMatches = await prisma.stackAutoTagAggregate.findMany({
        where: {
          stack: {
            dataSetId,
            ...(baseWhere.mediaType ? { mediaType: baseWhere.mediaType } : {}),
            ...(favoriteFilter ? { favorites: favoriteFilter } : {}),
            ...(baseWhere.liked !== undefined ? { liked: baseWhere.liked } : {}),
          },
        },
        select: {
          stackId: true,
          topTags: true,
        },
      });

      // Filter stacks that have matching auto tags
      for (const aggregate of autoTagMatches) {
        const topTags = extractAutoTagEntries(aggregate.topTags);
        const hasMatchingTag = topTags.some(
          (entry) =>
            entry.tag !== undefined &&
            mappedAutoTagKeys.includes(entry.tag) &&
            (entry.score ?? 0) >= 0.4
        );
        if (hasMatchingTag) {
          autoTagMatchStackIds.push(aggregate.stackId);
        }
      }
    }

    // Also check for stacks that have the linked user tags from AutoTagMapping
    const linkedTagIds = autoTagMappings.filter((m) => m.tagId).map((m) => m.tagId!);
    let linkedTagStackIds: number[] = [];

    if (linkedTagIds.length > 0) {
      const linkedTagMatches = await prisma.tagsOnStack.findMany({
        where: {
          tagId: { in: linkedTagIds },
          stack: {
            dataSetId,
            ...(baseWhere.mediaType ? { mediaType: baseWhere.mediaType } : {}),
            ...(favoriteFilter ? { favorites: favoriteFilter } : {}),
            ...(baseWhere.liked !== undefined ? { liked: baseWhere.liked } : {}),
          },
        },
        select: {
          stackId: true,
        },
      });
      linkedTagStackIds = linkedTagMatches.map((t) => t.stackId);
    }

    // Get all unique stack IDs from keyword searches
    const keywordStackIds = [
      ...new Set([
        ...exactNameStackIds,
        ...prefixStackIds,
        ...tagMatchStackIds,
        ...autoTagMatchStackIds,
        ...linkedTagStackIds,
      ]),
    ];

    const allUniqueStackIds = keywordStackIds;

    console.log('Search results:', {
      keywordMatches: keywordStackIds.length,
      totalUnique: allUniqueStackIds.length,
      baseWhere,
    });

    if (allUniqueStackIds.length === 0) {
      return {
        stacks: [],
        total: 0,
        limit,
        offset,
      };
    }

    // First, get the actual count of matching stacks after applying all filters
    const actualMatchingStackIds = await prisma.stack.findMany({
      where: {
        id: { in: allUniqueStackIds },
        ...baseWhere,
      },
      select: { id: true },
    });

    const actualTotal = actualMatchingStackIds.length;

    console.log('Search filtering results:', {
      beforeFiltering: allUniqueStackIds.length,
      afterFiltering: actualTotal,
      baseWhere,
    });

    // If no results after filtering, return empty
    if (actualTotal === 0) {
      return {
        stacks: [],
        total: 0,
        limit,
        offset,
      };
    }

    // Fetch detailed stack data for the filtered results
    const allStacks = await prisma.stack.findMany({
      where: {
        id: { in: actualMatchingStackIds.map((s) => s.id) },
      },
      include: {
        author: true,
        assets: {
          take: 1,
          orderBy: { orderInStack: 'asc' },
          select: {
            id: true,
            thumbnail: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        autoTagAggregate: true,
        _count: {
          select: {
            assets: true,
            tags: true,
          },
        },
      },
    });

    // Calculate combined scores
    const combinedScoredStacks = allStacks.map((stack) => {
      let keywordScore = 0;
      const vectorScore = vectorSimilarityMap.get(stack.id) || 0;

      // Keyword scoring (same as before)
      if (exactNameStackIds.includes(stack.id)) {
        keywordScore += 10;
      } else if (prefixStackIds.includes(stack.id)) {
        keywordScore += 5;
      }

      if (tagMatchStackIds.includes(stack.id)) {
        keywordScore += 8;
      }

      // Check if matched through AutoTagMapping
      if (autoTagMatchStackIds.includes(stack.id)) {
        keywordScore += 6; // Higher than direct auto tag match
      }

      // Check if matched through linked tag from AutoTagMapping
      if (linkedTagStackIds.includes(stack.id)) {
        keywordScore += 7; // Almost as high as direct tag match
      }

      // Direct auto tag matching (when query matches auto tag directly)
      if (stack.autoTagAggregate?.topTags) {
        const autoTagEntries = extractAutoTagEntries(stack.autoTagAggregate.topTags);
        const matchingAutoTag = autoTagEntries.find(
          (entry) => entry.tag?.toLowerCase() === query.toLowerCase() && (entry.score ?? 0) >= 0.4
        );
        if (matchingAutoTag && matchingAutoTag.score !== undefined) {
          keywordScore += 4 * matchingAutoTag.score;
        }
      }

      // Popularity and recency (applied to both)
      let generalBoost = 0;
      if (stack.liked > 0) {
        generalBoost += Math.log(stack.liked + 1) * 0.5;
      }

      const daysSinceUpdate =
        (Date.now() - new Date(stack.updateAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 30) {
        generalBoost += (30 - daysSinceUpdate) / 30;
      }

      // Combine scores with weights
      // Keyword matches are more precise, so they get higher weight
      const combinedScore = keywordScore * 1.5 + vectorScore * 10 + generalBoost;

      return {
        ...stack,
        keywordScore,
        vectorScore,
        searchScore: combinedScore,
      };
    });

    // Sort based on the sort parameter
    const effectiveSort = sort || 'recommended';

    if (effectiveSort === 'recommended') {
      // For recommended with search: sort by score (highest first)
      combinedScoredStacks.sort((a, b) => b.searchScore - a.searchScore);
    } else {
      // For explicit sort parameters: apply secondary sort after score
      const sortField = effectiveSort === 'updateAt' ? 'updateAt' : effectiveSort;
      const sortOrder = order || 'desc';

      const getSortValue = (
        stack: (typeof combinedScoredStacks)[number],
        field: string
      ): string | number | Date | undefined => {
        switch (field) {
          case 'name':
            return stack.name ?? '';
          case 'id':
            return stack.id;
          case 'liked':
            return stack.liked;
          case 'createdAt':
            return stack.createdAt;
          case 'updateAt':
            return stack.updateAt;
          default:
            return undefined;
        }
      };

      combinedScoredStacks.sort((a, b) => {
        // Primary sort by search score (for relevance)
        const scoreDiff = b.searchScore - a.searchScore;
        if (Math.abs(scoreDiff) > 0.1) {
          // Only use secondary sort if scores are close
          return scoreDiff;
        }

        // Secondary sort by specified field
        const aVal = getSortValue(a, sortField);
        const bVal = getSortValue(b, sortField);

        if (sortField === 'name') {
          const aName = String(aVal ?? '');
          const bName = String(bVal ?? '');
          return sortOrder === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }
        if (aVal instanceof Date && bVal instanceof Date) {
          return sortOrder === 'asc'
            ? aVal.getTime() - bVal.getTime()
            : bVal.getTime() - aVal.getTime();
        }

        return 0;
      });
    }

    // Apply pagination
    const paginatedStacks = combinedScoredStacks.slice(offset, offset + limit);

    // Format thumbnails
    const formattedStacks = formatStacksThumbnails(
      paginatedStacks.map((stack) => {
        const firstAsset = stack.assets[0];
        const thumbnail = firstAsset?.thumbnail || stack.thumbnail || '';
        return {
          ...stack,
          thumbnail,
          assetCount: stack._count.assets,
          tags: stack.tags.map((t) => t.tag.title),
          author: stack.author?.name || '',
          // Include scores for debugging
          _debug: {
            keywordScore: stack.keywordScore,
            vectorScore: stack.vectorScore,
            totalScore: stack.searchScore,
          },
        };
      })
    );

    return {
      stacks: formattedStacks,
      total: actualTotal,
      limit,
      offset,
    };
  }

  async function updateThumbnails(stackId: number) {
    const assets = await prisma.asset.findMany({
      where: { stackId },
    });

    for (const asset of assets) {
      console.log('Updating thumbnail for:', asset.file);
      const thumbnailKey = await generateThumbnail(asset.file, asset.fileType, true);

      await prisma.asset.update({
        where: { id: asset.id },
        data: { thumbnail: thumbnailKey },
      });
    }

    return { updated: assets.length };
  }

  async function addTag(stackId: number, tagTitle: string) {
    if (!tagTitle || tagTitle.trim() === '') {
      throw new Error('Tag title cannot be empty');
    }

    // スタックがこのデータセットに属しているか確認
    const stack = await prisma.stack.findFirst({
      where: { id: stackId, dataSetId },
    });

    if (!stack) {
      throw new Error('Stack not found in this dataset');
    }

    // Find or create tag
    let tag = await prisma.tag.findFirst({
      where: { title: tagTitle, dataSetId },
    });

    if (!tag) {
      tag = await prisma.tag.create({
        data: { title: tagTitle, dataSetId },
      });
    }

    // Check if tag is already associated
    const existing = await prisma.tagsOnStack.findUnique({
      where: {
        stackId_tagId: {
          stackId,
          tagId: tag.id,
        },
      },
    });

    if (!existing) {
      await prisma.tagsOnStack.create({
        data: {
          stackId,
          tagId: tag.id,
        },
      });

      // Embedding regeneration removed
    }

    return { success: true };
  }

  async function removeTag(stackId: number, tagTitle: string) {
    // スタックがこのデータセットに属しているか確認
    const stack = await prisma.stack.findFirst({
      where: { id: stackId, dataSetId },
    });

    if (!stack) {
      throw new Error('Stack not found in this dataset');
    }

    const tag = await prisma.tag.findFirst({
      where: { title: tagTitle, dataSetId },
    });

    if (tag) {
      await prisma.tagsOnStack.delete({
        where: {
          stackId_tagId: {
            stackId,
            tagId: tag.id,
          },
        },
      });

      // Embedding regeneration removed
    }

    return { success: true };
  }

  async function updateAuthor(stackId: number, authorName: string) {
    // スタックがこのデータセットに属しているか確認
    const stack = await prisma.stack.findFirst({
      where: { id: stackId, dataSetId },
    });

    if (!stack) {
      throw new Error('Stack not found in this dataset');
    }

    if (!authorName || authorName.trim() === '') {
      // Remove author
      await prisma.stack.update({
        where: { id: stackId },
        data: { authorId: null },
      });
    } else {
      // Find or create author
      let author = await prisma.author.findFirst({
        where: { name: authorName, dataSetId },
      });

      if (!author) {
        author = await prisma.author.create({
          data: { name: authorName, dataSetId },
        });
      }

      await prisma.stack.update({
        where: { id: stackId },
        data: { authorId: author.id },
      });
    }

    // Embedding regeneration removed

    return { success: true };
  }

  async function like(stackId: number) {
    const userId = await ensureSuperUser(prisma);

    // Increment the liked count
    await prisma.stack.update({
      where: { id: stackId },
      data: {
        liked: {
          increment: 1,
        },
      },
    });

    // Create activity record
    await prisma.likeActivity.create({
      data: {
        stackId,
        userId,
      },
    });

    return { success: true };
  }

  async function setFavorite(stackId: number, favorited: boolean) {
    const userId = await ensureSuperUser(prisma);

    if (favorited) {
      await prisma.stackFavorite.upsert({
        where: {
          userId_stackId: {
            userId,
            stackId,
          },
        },
        update: {},
        create: {
          userId,
          stackId,
        },
      });
    } else {
      await prisma.stackFavorite.deleteMany({
        where: {
          userId,
          stackId,
        },
      });
    }

    return { success: true };
  }

  async function refreshThumbnail(id: number) {
    const stack = await prisma.stack.findUnique({
      where: { id, dataSetId },
      include: { assets: { take: 1, orderBy: { id: 'asc' } } },
    });

    if (!stack) {
      throw new Error('Stack not found');
    }

    if (stack.assets.length === 0) {
      throw new Error('No assets found for this stack');
    }

    const firstAsset = stack.assets[0];
    const newThumbnail = await generateThumbnail(
      firstAsset.file,
      firstAsset.fileType,
      true,
      dataSetId
    );

    await prisma.stack.update({
      where: { id },
      data: { thumbnail: newThumbnail },
    });

    return { success: true, message: 'Thumbnail refreshed successfully' };
  }

  async function regeneratePreviews(id: number, options?: { force?: boolean }) {
    const { force = true } = options ?? {};

    const stack = await prisma.stack.findUnique({
      where: { id, dataSetId },
      include: {
        assets: {
          select: {
            id: true,
            file: true,
            fileType: true,
            hash: true,
            preview: true,
          },
          orderBy: { orderInStack: 'asc' },
        },
      },
    });

    if (!stack) {
      throw new Error('Stack not found');
    }

    const eligibleAssets = stack.assets.filter((asset) => shouldGeneratePreview(asset.fileType));
    const results: Array<{ assetId: number; preview: string | null }> = [];
    const failures: number[] = [];

    for (const asset of eligibleAssets) {
      try {
        const previewKey = await generateMediaPreview(asset.file, asset.hash, asset.fileType, {
          dataSetId,
          force,
        });

        if (previewKey) {
          await prisma.asset.update({
            where: { id: asset.id },
            data: { preview: previewKey },
          });
          results.push({ assetId: asset.id, preview: previewKey });
        } else {
          if (force && !asset.preview) {
            await prisma.asset.update({
              where: { id: asset.id },
              data: { preview: null },
            });
          }
          results.push({ assetId: asset.id, preview: asset.preview ?? null });
        }
      } catch (error) {
        failures.push(asset.id);
        console.error(`Failed to regenerate preview for asset ${asset.id}`, error);
        results.push({ assetId: asset.id, preview: asset.preview ?? null });
      }
    }

    return {
      success: failures.length === 0,
      totalAssets: stack.assets.length,
      eligible: eligibleAssets.length,
      regenerated: results.filter((entry) => entry.preview).length,
      failed: failures,
      previews: results,
    };
  }

  // Bulk operations
  async function bulkAddTags(stackIds: number[], tags: string[]) {
    // Verify all stacks exist in this dataset
    const stackCount = await prisma.stack.count({
      where: { id: { in: stackIds }, dataSetId },
    });

    if (stackCount !== stackIds.length) {
      throw new Error('Some stacks not found in this dataset');
    }

    // Create tags if they don't exist
    const tagRecords = await Promise.all(
      tags.map(async (tagTitle) => {
        let tag = await prisma.tag.findFirst({
          where: { title: tagTitle, dataSetId },
        });

        if (!tag) {
          tag = await prisma.tag.create({
            data: { title: tagTitle, dataSetId },
          });
        }

        return tag;
      })
    );

    // Create tag associations for each stack
    const tagsOnStackData = [];
    for (const stackId of stackIds) {
      for (const tag of tagRecords) {
        // Check if association already exists
        const existing = await prisma.tagsOnStack.findUnique({
          where: {
            stackId_tagId: {
              stackId,
              tagId: tag.id,
            },
          },
        });

        if (!existing) {
          tagsOnStackData.push({
            stackId,
            tagId: tag.id,
          });
        }
      }
    }

    if (tagsOnStackData.length > 0) {
      await prisma.tagsOnStack.createMany({
        data: tagsOnStackData,
        skipDuplicates: true,
      });
    }

    // Embedding regeneration removed

    return { success: true, updated: stackIds.length };
  }

  async function bulkSetAuthor(stackIds: number[], authorName: string) {
    // Verify all stacks exist in this dataset
    const stackCount = await prisma.stack.count({
      where: { id: { in: stackIds }, dataSetId },
    });

    if (stackCount !== stackIds.length) {
      throw new Error('Some stacks not found in this dataset');
    }

    // Find or create author
    let author = await prisma.author.findFirst({
      where: { name: authorName, dataSetId },
    });

    if (!author) {
      author = await prisma.author.create({
        data: { name: authorName, dataSetId },
      });
    }

    // Update all stacks
    await prisma.stack.updateMany({
      where: { id: { in: stackIds }, dataSetId },
      data: { authorId: author.id },
    });

    // Embedding regeneration removed

    return { success: true, updated: stackIds.length };
  }

  async function bulkSetMediaType(stackIds: number[], mediaType: 'image' | 'comic' | 'video') {
    // Verify all stacks exist in this dataset
    const stackCount = await prisma.stack.count({
      where: { id: { in: stackIds }, dataSetId },
    });

    if (stackCount !== stackIds.length) {
      throw new Error('Some stacks not found in this dataset');
    }

    // Update all stacks
    await prisma.stack.updateMany({
      where: { id: { in: stackIds }, dataSetId },
      data: { mediaType },
    });

    return { success: true, updated: stackIds.length };
  }

  async function bulkSetFavorite(stackIds: number[], favorited: boolean) {
    // Verify all stacks exist in this dataset
    const stackCount = await prisma.stack.count({
      where: { id: { in: stackIds }, dataSetId },
    });

    if (stackCount !== stackIds.length) {
      throw new Error('Some stacks not found in this dataset');
    }

    const userId = await ensureSuperUser(prisma);

    if (favorited) {
      const data = stackIds.map((stackId) => ({ userId, stackId }));
      if (data.length > 0) {
        await prisma.stackFavorite.createMany({
          data,
          skipDuplicates: true,
        });
      }
    } else {
      await prisma.stackFavorite.deleteMany({
        where: {
          userId,
          stackId: { in: stackIds },
        },
      });
    }

    return { success: true, updated: stackIds.length };
  }

  async function bulkRefreshThumbnails(stackIds: number[]) {
    // Verify all stacks exist in this dataset
    const stacks = await prisma.stack.findMany({
      where: { id: { in: stackIds }, dataSetId },
      include: { assets: { take: 1, orderBy: { id: 'asc' } } },
    });

    if (stacks.length !== stackIds.length) {
      throw new Error('Some stacks not found in this dataset');
    }

    const errors: string[] = [];
    let updated = 0;

    // Process each stack
    for (const stack of stacks) {
      try {
        if (stack.assets.length > 0) {
          const firstAsset = stack.assets[0];
          const newThumbnail = await generateThumbnail(
            firstAsset.file,
            firstAsset.fileType,
            true,
            dataSetId
          );

          await prisma.stack.update({
            where: { id: stack.id },
            data: { thumbnail: newThumbnail },
          });

          updated++;
        } else {
          errors.push(`Stack ${stack.id}: No assets found`);
        }
      } catch (error) {
        errors.push(
          `Stack ${stack.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      success: errors.length === 0,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Merge source stacks into target stack within the same dataset
  async function mergeStacks(targetId: number, sourceIds: number[]) {
    // Ensure IDs are distinct and non-empty
    const uniqueSourceIds = Array.from(new Set(sourceIds.filter((id) => id !== targetId)));
    if (uniqueSourceIds.length === 0) {
      throw new Error('No valid source stacks to merge');
    }

    // Fetch and validate stacks belong to this dataset
    const target = await prisma.stack.findUnique({ where: { id: targetId } });
    if (!target) throw new Error('Target stack not found');
    if (target.dataSetId !== dataSetId) throw new Error('Target stack not in this dataset');

    const sources = await prisma.stack.findMany({ where: { id: { in: uniqueSourceIds } } });
    if (sources.length !== uniqueSourceIds.length) throw new Error('Some source stacks not found');
    const invalid = sources.find((s) => s.dataSetId !== dataSetId);
    if (invalid) throw new Error('Source stack not in this dataset');

    // Determine next order position in target
    const [maxOrderAgg, currentCount] = await Promise.all([
      prisma.asset.aggregate({ where: { stackId: targetId }, _max: { orderInStack: true } }),
      prisma.asset.count({ where: { stackId: targetId } }),
    ]);
    let nextOrder = maxOrderAgg._max.orderInStack ?? currentCount ?? 0;

    // Move assets from sources to target in a consistent order
    // Iterate in the order provided by sourceIds to preserve caller intent
    for (const sourceId of uniqueSourceIds) {
      const source = sources.find((s) => s.id === sourceId)!;
      const assets = await prisma.asset.findMany({
        where: { stackId: source.id },
        orderBy: [{ orderInStack: 'asc' }, { createdAt: 'asc' }],
      });

      for (const asset of assets) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { stackId: targetId, orderInStack: nextOrder++ },
        });
      }
    }

    // Sum likes across target + sources
    const likeSum = sources.reduce((acc, s) => acc + (s.liked || 0), target.liked || 0);
    await prisma.stack.update({ where: { id: targetId }, data: { liked: likeSum } });

    // Delete source stacks
    await prisma.stack.deleteMany({ where: { id: { in: uniqueSourceIds } } });

    return prisma.stack.findUnique({ where: { id: targetId } });
  }

  async function bulkRemoveStacks(stackIds: number[]) {
    // Verify all stacks exist in this dataset
    const stackCount = await prisma.stack.count({
      where: { id: { in: stackIds }, dataSetId },
    });

    if (stackCount !== stackIds.length) {
      throw new Error('Some stacks not found in this dataset');
    }

    const errors: string[] = [];
    let removed = 0;

    // Process each stack
    for (const stackId of stackIds) {
      try {
        // Delete the stack (cascading deletes will handle related data)
        await prisma.stack.delete({
          where: { id: stackId },
        });

        removed++;
      } catch (error) {
        errors.push(
          `Stack ${stackId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      success: errors.length === 0,
      removed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Get collection IDs that contain this stack
  async function getCollectionsByStackId(stackId: number): Promise<{ collectionIds: number[] }> {
    // Verify stack exists in this dataset
    const stack = await prisma.stack.findFirst({
      where: { id: stackId, dataSetId },
    });

    if (!stack) {
      throw new Error('Stack not found in this dataset');
    }

    // Get collection IDs
    const collectionStacks = await prisma.collectionStack.findMany({
      where: { stackId },
      select: { collectionId: true },
    });

    return {
      collectionIds: collectionStacks.map((cs) => cs.collectionId),
    };
  }

  /**
   * 検索結果をランク付けする
   */
  function rankSearchResults(
    searchResults: {
      textMatches: Set<number>;
      tagMatches: Set<number>;
      autoTagMatches: Set<number>;
    },
    colorStackIds?: Set<number>,
    similarStackIds?: Set<number>
  ): { id: number; score: number }[] {
    const scores = new Map<number, number>();

    // 重み付け
    const weights = {
      autoTag: 3,
      tag: 3,
      text: 2,
      color: 1,
      similar: 2,
    };

    // スコア計算
    const allIds = new Set([
      ...searchResults.textMatches,
      ...searchResults.tagMatches,
      ...searchResults.autoTagMatches,
      ...(colorStackIds || []),
      ...(similarStackIds || []),
    ]);

    for (const id of allIds) {
      let score = 0;
      // embeddings/clip removed
      if (searchResults.autoTagMatches.has(id)) score += weights.autoTag;
      if (searchResults.tagMatches.has(id)) score += weights.tag;
      if (searchResults.textMatches.has(id)) score += weights.text;
      if (colorStackIds?.has(id)) score += weights.color;
      if (similarStackIds?.has(id)) score += weights.similar;
      scores.set(id, score);
    }

    // スコアでソート
    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    getAll,
    getAllWithFilters,
    getById,
    create,
    createWithFile,
    update,
    delete: deleteStack,
    performUnifiedSearch,
    searchWithRanking,
    updateThumbnails,
    addTag,
    removeTag,
    updateAuthor,
    like,
    setFavorite,
    refreshThumbnail,
    regeneratePreviews,
    bulkAddTags,
    bulkSetAuthor,
    bulkSetMediaType,
    bulkSetFavorite,
    bulkRefreshThumbnails,
    mergeStacks,
    bulkRemoveStacks,
    getCollectionsByStackId,
  };
};
