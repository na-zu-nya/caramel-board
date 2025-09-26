import {prisma} from '../di';
import {withPublicAssetArray, toPublicAssetPath} from '../../utils/assetPath';

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface YearlyLikesOptions {
  year: number;
  datasetId?: string;
  search?: string;
}

export class ActivityService {
  async getGroupedByCategory(pagination: PaginationOptions) {
    const { limit, offset } = pagination;

    // Get recent stacks grouped by mediaType
    const mediaTypesResult = await prisma.stack.findMany({
      select: { mediaType: true },
      distinct: ['mediaType'],
      orderBy: { mediaType: 'asc' },
    });

    const groupedResults: Record<string, any[]> = {};

    for (const { mediaType } of mediaTypesResult) {
      const stacks = await prisma.stack.findMany({
        where: { mediaType },
        skip: offset,
        take: limit,
        orderBy: { updateAt: 'desc' },
        include: {
          assets: {
            take: 1,
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: { assets: true },
          },
        },
      });

      groupedResults[mediaType] = stacks.map((stack) => {
        const assets = withPublicAssetArray(stack.assets as any[], stack.dataSetId);
        const thumbnail = toPublicAssetPath(
          assets[0]?.thumbnail || stack.thumbnail,
          stack.dataSetId
        );

        return {
          ...stack,
          assets,
          thumbnail,
          assetCount: stack._count.assets,
        };
      });
    }

    return {
      activities: groupedResults,
      limit,
      offset,
    };
  }

  async getLikes(pagination: PaginationOptions) {
    const { limit, offset } = pagination;

    const likeActivities = await prisma.likeActivity.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        stack: {
          include: {
            assets: {
              take: 1,
              orderBy: { createdAt: 'asc' },
            },
            author: true,
            tags: {
              include: {
                tag: true,
              },
            },
            _count: {
              select: { assets: true },
            },
          },
        },
      },
    });

    const total = await prisma.likeActivity.count();

    // Transform the data to match expected format
    const transformedActivities = likeActivities.map((activity) => {
      const assets = withPublicAssetArray(activity.stack.assets as any[], activity.stack.dataSetId);
      const thumbnail = toPublicAssetPath(
        assets[0]?.thumbnail || activity.stack.thumbnail,
        activity.stack.dataSetId
      );

      return {
        id: activity.id,
        stackId: activity.stackId,
        createdAt: activity.createdAt,
        stack: {
          ...activity.stack,
          assets,
          thumbnail,
          assetsCount: activity.stack._count.assets,
          tags: activity.stack.tags.map((t) => t.tag.title),
        },
      };
    });

    return {
      activities: transformedActivities,
      total,
      limit,
      offset,
    };
  }

  async getLikesByYear(options: YearlyLikesOptions) {
    const { year, datasetId, search } = options;
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    // Base like activities (optionally filter by datasetId)
    const likeActivities = await prisma.likeActivity.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
        ...(datasetId && {
          stack: {
            dataSetId: Number(datasetId), // Note: it's dataSetId, not datasetId in schema
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        stack: {
          include: {
            assets: {
              take: 1,
              orderBy: { createdAt: 'asc' },
            },
            author: true,
            tags: {
              include: {
                tag: true,
              },
            },
            _count: {
              select: { assets: true },
            },
          },
        },
      },
    });

    // If a free-word search is requested, filter liked stacks by unified search results
    let filteredActivities = likeActivities;
    if (search && search.trim() && datasetId) {
      // Build a minimal unified search using the same dataset (no embeddings)
      const dataSetIdNum = Number(datasetId);
      const { createColorSearchService } = await import('../../features/datasets/services/color-search-service');
      const { createTagStatsService } = await import('../../features/datasets/services/tag-stats-service');
      const { createSearchService, SearchMode } = await import('../../features/datasets/services/search-service');
      const colorSearch = createColorSearchService({ prisma, dataSetId: dataSetIdNum });
      const tagStats = createTagStatsService({ prisma, dataSetId: dataSetIdNum });
      const searchService = createSearchService({ prisma, colorSearch, tagStats, dataSetId: dataSetIdNum });
      const result = await searchService.search({
        mode: SearchMode.UNIFIED,
        datasetId: dataSetIdNum,
        query: search.trim(),
        filters: {},
        sort: { by: 'recommended', order: 'desc' },
        pagination: { limit: 1000, offset: 0 },
      });
      const allow = new Set(result.stacks.map((s: any) => s.id));
      filteredActivities = likeActivities.filter((a) => allow.has(a.stackId));
    }

    // Group by month
    const groupedByMonth: Record<string, any[]> = {};

    for (const activity of filteredActivities) {
      const month = activity.createdAt.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = [];
      }

      const assets = withPublicAssetArray(activity.stack.assets as any[], activity.stack.dataSetId);
      const thumbnail = toPublicAssetPath(
        assets[0]?.thumbnail || activity.stack.thumbnail,
        activity.stack.dataSetId
      );

      groupedByMonth[monthKey].push({
        id: activity.id,
        stackId: activity.stackId,
        createdAt: activity.createdAt,
        stack: {
          ...activity.stack,
          assets,
          thumbnail,
          assetsCount: activity.stack._count.assets,
          tags: activity.stack.tags.map((t) => t.tag.title),
        },
      });
    }

    // Get available years for pagination
    const allLikes = await prisma.likeActivity.findMany({
      where: datasetId ? { stack: { dataSetId: Number(datasetId) } } : undefined,
      select: { createdAt: true },
    });

    const availableYears = new Set<number>();
    for (const like of allLikes) {
      availableYears.add(like.createdAt.getFullYear());
    }

    return {
      year,
      groupedByMonth,
      totalItems: filteredActivities.length,
      availableYears: Array.from(availableYears).sort((a, b) => b - a),
    };
  }
}
