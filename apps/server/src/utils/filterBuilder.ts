import type { Prisma } from '@prisma/client';

export interface FilterConfig {
  mediaType?: string;
  favorited?: boolean;
  liked?: boolean;
  authorId?: number;
  tagIds?: number[];
  colorFilter?: {
    hueCategories?: string[];
    toneSaturation?: number;
    toneLightness?: number;
    toneTolerance?: number;
    similarityThreshold?: number;
    customColor?: string;
  };
}

export interface UnifiedFilterOptions {
  dataSetId: number;
  mediaType?: string;
  tags?: string[];
  authors?: string[];
  favorited?: boolean;
  liked?: boolean;
  hasNoTags?: boolean;
  hasNoAuthor?: boolean;
  collection?: number;
  autoTagIds?: number[];
  colorStackIds?: number[];
  searchStackIds?: number[];
  referenceStackId?: number; // 類似検索の基準となるスタックID
}

export interface StackIdConstraints {
  color?: number[];
  autoTag?: number[];
  search?: number[];
  similar?: number[]; // referenceStackIdによる類似スタックID
}

/**
 * Build Prisma where clause from filter configuration
 * @param filterConfig - Filter configuration object
 * @param dataSetId - Dataset ID to filter by
 * @returns Prisma.StackWhereInput
 */
export function buildStackWhereClause(
  filterConfig: FilterConfig,
  dataSetId: number,
  favoriteUserId?: number
): Prisma.StackWhereInput {
  const where: Prisma.StackWhereInput = {
    dataSetId,
  };

  // Media type filter
  if (filterConfig.mediaType) {
    where.mediaType = filterConfig.mediaType;
  }

  // Favorited filter
  if (filterConfig.favorited !== undefined && favoriteUserId !== undefined) {
    where.favorites = filterConfig.favorited
      ? {
          some: {
            userId: favoriteUserId,
          },
        }
      : {
          none: {
            userId: favoriteUserId,
          },
        };
  }

  // Liked filter
  if (filterConfig.liked !== undefined) {
    if (filterConfig.liked) {
      where.liked = { gt: 0 };
    } else {
      where.liked = 0;
    }
  }

  // Author filter
  if (filterConfig.authorId) {
    where.authorId = filterConfig.authorId;
  }

  // Tag filter
  if (filterConfig.tagIds && filterConfig.tagIds.length > 0) {
    where.tags = {
      some: {
        tagId: {
          in: filterConfig.tagIds,
        },
      },
    };
  }

  return where;
}

/**
 * Check if filter has color filtering enabled
 * @param filterConfig - Filter configuration object
 * @returns boolean
 */
export function hasColorFilter(filterConfig: FilterConfig): boolean {
  if (!filterConfig.colorFilter) return false;

  const { hueCategories, toneSaturation, toneLightness, similarityThreshold, customColor } =
    filterConfig.colorFilter;

  return !!(
    hueCategories?.length ||
    (toneSaturation !== undefined && toneLightness !== undefined) ||
    similarityThreshold !== undefined ||
    customColor
  );
}

/**
 * Extract color filter options for ColorSearchService
 * @param filterConfig - Filter configuration object
 * @param dataSetId - Dataset ID
 * @param limit - Result limit
 * @param offset - Result offset
 * @returns Color filter options
 */
export function extractColorFilterOptions(
  filterConfig: FilterConfig,
  dataSetId: number,
  limit: number,
  offset: number,
  favoriteUserId?: number
) {
  if (!filterConfig.colorFilter) return null;

  const {
    hueCategories,
    toneSaturation,
    toneLightness,
    toneTolerance,
    similarityThreshold,
    customColor,
  } = filterConfig.colorFilter;

  return {
    hueCategories: hueCategories || undefined,
    tonePoint:
      toneSaturation !== undefined && toneLightness !== undefined
        ? {
            saturation: toneSaturation,
            lightness: toneLightness,
          }
        : undefined,
    toneTolerance: toneTolerance,
    similarityThreshold: similarityThreshold,
    customColor: customColor,
    dataSetId,
    mediaType: filterConfig.mediaType,
    liked: filterConfig.liked,
    limit,
    offset,
    additionalWhere:
      filterConfig.favorited !== undefined && favoriteUserId !== undefined
        ? {
            favorites: filterConfig.favorited
              ? {
                  some: {
                    userId: favoriteUserId,
                  },
                }
              : {
                  none: {
                    userId: favoriteUserId,
                  },
                },
          }
        : undefined,
  };
}

/**
 * 統合的なフィルタビルダー - すべてのフィルタタイプを統一的に処理
 * @param options - 統合フィルタオプション
 * @returns Prisma.StackWhereInput
 */
export function buildUnifiedWhereClause(
  options: UnifiedFilterOptions,
  favoriteUserId?: number
): Prisma.StackWhereInput {
  const where: Prisma.StackWhereInput = {
    dataSetId: options.dataSetId,
  };

  // メディアタイプフィルタ
  if (options.mediaType) {
    where.mediaType = options.mediaType;
  }

  // お気に入りフィルタ
  if (options.favorited !== undefined && favoriteUserId !== undefined) {
    where.favorites = options.favorited
      ? {
          some: {
            userId: favoriteUserId,
          },
        }
      : {
          none: {
            userId: favoriteUserId,
          },
        };
  }

  // いいねフィルタ
  if (options.liked !== undefined) {
    if (options.liked) {
      where.liked = { gt: 0 };
    } else {
      where.liked = 0;
    }
  }

  // タグフィルタ
  if (options.hasNoTags) {
    where.tags = {
      none: {},
    };
  } else if (options.tags && options.tags.length > 0) {
    where.tags = {
      some: {
        tag: {
          title: {
            in: options.tags,
          },
        },
      },
    };
  }

  // 著者フィルタ
  if (options.hasNoAuthor) {
    where.authorId = null;
  } else if (options.authors && options.authors.length > 0) {
    where.author = {
      name: {
        in: options.authors,
      },
    };
  }

  // コレクションフィルタ
  if (options.collection) {
    where.collectionStacks = {
      some: {
        collectionId: options.collection,
      },
    };
  }

  // ID制約の統合（色、AutoTag、検索、類似）
  const idConstraints: number[][] = [];

  if (options.colorStackIds && options.colorStackIds.length > 0) {
    idConstraints.push(options.colorStackIds);
  }

  if (options.autoTagIds && options.autoTagIds.length > 0) {
    idConstraints.push(options.autoTagIds);
  }

  if (options.searchStackIds && options.searchStackIds.length > 0) {
    idConstraints.push(options.searchStackIds);
  }

  // すべてのID制約の交差を取る
  if (idConstraints.length > 0) {
    const intersectedIds = idConstraints.reduce((acc, ids) => {
      return acc.filter((id) => ids.includes(id));
    });

    if (intersectedIds.length > 0) {
      where.id = { in: intersectedIds };
    } else {
      // 交差が空の場合は、結果も空になるように不可能な条件を設定
      where.id = { in: [-1] };
    }
  }

  return where;
}

/**
 * スタックID制約を結合する
 * @param constraints - 各種フィルタによるスタックID制約
 * @returns 結合されたスタックID配列
 */
export function combineStackIdConstraints(constraints: StackIdConstraints): number[] {
  const allConstraints: number[][] = [];

  if (constraints.color && constraints.color.length > 0) {
    allConstraints.push(constraints.color);
  }

  if (constraints.autoTag && constraints.autoTag.length > 0) {
    allConstraints.push(constraints.autoTag);
  }

  if (constraints.search && constraints.search.length > 0) {
    allConstraints.push(constraints.search);
  }

  if (constraints.similar && constraints.similar.length > 0) {
    allConstraints.push(constraints.similar);
  }

  // 制約がない場合は空配列を返す
  if (allConstraints.length === 0) {
    return [];
  }

  // すべての制約の交差を取る
  return allConstraints.reduce((acc, ids) => {
    return acc.filter((id) => ids.includes(id));
  });
}
