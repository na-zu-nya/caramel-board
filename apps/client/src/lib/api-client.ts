import type {
  Asset,
  Collection,
  CollectionFolder,
  Dataset,
  ImportUrlResult,
  Pin,
  SortOption,
  Stack,
  StackFilter,
  StackPaginatedResponse,
} from '@/types';

const API_BASE_URL = '';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // Generic HTTP methods
  async get<T = any>(url: string): Promise<{ data: T }> {
    const response = await this.fetch<T>(url);
    return { data: response };
  }

  async post<T = any>(url: string, data?: any): Promise<{ data: T }> {
    const response = await this.fetch<T>(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
    return { data: response };
  }

  async put<T = any>(url: string, data?: any): Promise<{ data: T }> {
    const response = await this.fetch<T>(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
    return { data: response };
  }

  async delete<T = any>(url: string): Promise<{ data: T }> {
    const response = await this.fetch<T>(url, {
      method: 'DELETE',
    });
    return { data: response };
  }

  // Dataset APIs
  async getDatasets(): Promise<Dataset[]> {
    return this.fetch<Dataset[]>('/api/v1/datasets');
  }

  async getDataset(id: string): Promise<Dataset> {
    return this.fetch<Dataset>(`/api/v1/datasets/${id}`);
  }

  async createDataset(data: {
    name: string;
    icon?: string;
    themeColor?: string;
    description?: string;
  }): Promise<Dataset> {
    return this.fetch<Dataset>('/api/v1/datasets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDataset(
    id: string,
    data: { name?: string; icon?: string; themeColor?: string; description?: string }
  ): Promise<Dataset> {
    return this.fetch<Dataset>(`/api/v1/datasets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDataset(id: string): Promise<void> {
    await this.fetch(`/api/v1/datasets/${id}`, {
      method: 'DELETE',
    });
  }

  async getDatasetOverview(id: string): Promise<{
    mediaTypes: Array<{ mediaType: string; count: number; thumbnail: string | null }>;
    collections: Array<{
      id: number;
      name: string;
      icon: string;
      count: number;
      thumbnail: string | null;
    }>;
    tagCloud: Array<{ id: string; name: string; displayName?: string; count: number }>;
    recentLikes: Array<{
      id: string | number;
      name: string;
      thumbnail: string | null;
      likeCount: number;
      mediaType: string;
    }>;
  }> {
    return this.fetch(`/api/v1/datasets/${id}/overview`);
  }

  // Dataset protection
  async setDatasetProtection(
    id: string | number,
    params: { enable: boolean; password?: string; currentPassword?: string }
  ): Promise<{ success: boolean; isProtected: boolean }> {
    return this.fetch(`/api/v1/datasets/${id}/protection`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async authDataset(id: string | number, password: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/v1/datasets/${id}/auth`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async getDatasetProtectionStatus(
    id: string | number
  ): Promise<{ isProtected: boolean; authorized: boolean }> {
    return this.fetch(`/api/v1/datasets/${id}/protection-status`);
  }

  // Default dataset
  async setDefaultDataset(id: string | number): Promise<{ success: boolean }> {
    return this.fetch(`/api/v1/datasets/${id}/set-default`, {
      method: 'POST',
    });
  }

  // Stack APIs
  async getStacks(params: {
    datasetId: string | number;
    filter?: StackFilter;
    sort?: SortOption;
    limit?: number;
    offset?: number;
  }): Promise<StackPaginatedResponse> {
    const queryParams = new URLSearchParams();

    // Always add datasetId as required parameter
    queryParams.append('dataSetId', String(params.datasetId));

    if (params.filter) {
      for (const [key, value] of Object.entries(params.filter)) {
        if (value !== undefined) {
          // Map client filter names to API parameter names
          let paramKey = key;
          let paramValue: any = value;

          if (key === 'isFavorite') {
            paramKey = 'fav';
            paramValue = value === true ? '1' : value === false ? '0' : undefined;
          } else if (key === 'isLiked') {
            paramKey = 'liked';
            paramValue = value === true ? '1' : value === false ? '0' : undefined;
          } else if (key === 'tags') {
            paramKey = 'tag';
          } else if (key === 'authors') {
            // Server accepts multiple author params; keep all values
            paramKey = 'author';
            paramValue = value;
          } else if (key === 'collectionId') {
            paramKey = 'collection';
            paramValue = String(value);
          } else if (key === 'datasetId') {
            // Skip datasetId in filter as it's already added as required parameter
            continue;
          } else if (key === 'hasNoTags' || key === 'hasNoAuthor') {
            // Pass through as booleans; server coerces to boolean
            paramKey = key;
            paramValue = value as any;
          } else if (key === 'colorFilter' && value) {
            // 色域フィルタをクエリパラメータに変換
            const colorFilter = value as any;
            if (colorFilter.hueCategories && colorFilter.hueCategories.length > 0) {
              colorFilter.hueCategories.forEach((hue: string) => {
                queryParams.append('hueCategories', hue);
              });
            }
            if (colorFilter.tonePoint) {
              queryParams.append('toneSaturation', String(colorFilter.tonePoint.saturation));
              queryParams.append('toneLightness', String(colorFilter.tonePoint.lightness));
            }
            if (colorFilter.toneTolerance !== undefined) {
              queryParams.append('toneTolerance', String(colorFilter.toneTolerance));
            }
            // similarityThreshold 一時無効化
            if (colorFilter.customColor !== undefined) {
              queryParams.append('customColor', String(colorFilter.customColor));
            }
            continue; // colorFilterは他の処理をスキップ
          }

          if (paramValue !== undefined) {
            if (Array.isArray(paramValue)) {
              paramValue.forEach((v) => queryParams.append(paramKey, v));
            } else {
              queryParams.append(paramKey, String(paramValue));
            }
          }
        }
      }
    }

    if (params.sort && params.sort.field !== 'recommended') {
      queryParams.append('sort', params.sort.field);
      queryParams.append('order', params.sort.order);
    }

    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.offset) queryParams.append('offset', String(params.offset));

    const response = await this.fetch<StackPaginatedResponse>(
      `/api/v1/stacks/paginated?${queryParams}`
    );
    return this.normalizeStackResponse(response);
  }

  // Alias method for collection compatibility
  async getStacksWithFilters(params: {
    dataSetId: string | number;
    [key: string]: any;
  }): Promise<StackPaginatedResponse> {
    const queryParams = new URLSearchParams();

    // Always add datasetId as required parameter
    queryParams.append('dataSetId', String(params.dataSetId));

    // Clean parameters mapping to avoid duplicates
    const cleanParams = {
      limit: params.limit,
      offset: params.offset,
      collection: params.collection,
      mediaType: params.mediaType,
      tag: params.tag,
      author: params.author,
      fav: params.fav,
      liked: params.liked,
      search: params.search,
      hasNoTags: params.hasNoTags,
      hasNoAuthor: params.hasNoAuthor,
      sort: params.sort,
      order: params.order,
    };

    // Convert clean parameters to query string
    for (const [key, value] of Object.entries(cleanParams)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((v) => queryParams.append(key, String(v)));
        } else {
          queryParams.append(key, String(value));
        }
      }
    }

    const response = await this.fetch<StackPaginatedResponse>(
      `/api/v1/stacks/paginated?${queryParams}`
    );
    return this.normalizeStackResponse(response);
  }

  async getStack(stackId: string | number, datasetId?: string | number): Promise<Stack> {
    const params = new URLSearchParams();
    if (datasetId) {
      params.append('dataSetId', String(datasetId));
    }
    const queryString = params.toString();
    return this.fetch<Stack>(`/api/v1/stacks/${stackId}${queryString ? `?${queryString}` : ''}`);
  }

  // Similar stacks (embedding-based)
  async getSimilarStacks(params: {
    datasetId: string | number;
    stackId: string | number;
    limit?: number;
    offset?: number;
    threshold?: number; // 0-1
  }): Promise<StackPaginatedResponse> {
    const { datasetId, stackId, limit, offset, threshold } = params;
    const query = new URLSearchParams();
    if (limit !== undefined) query.append('limit', String(limit));
    if (offset !== undefined) query.append('offset', String(offset));
    if (threshold !== undefined) query.append('threshold', String(threshold));
    const response = await this.fetch<StackPaginatedResponse>(
      `/api/v1/datasets/${datasetId}/stacks/${stackId}/similar${
        query.toString() ? `?${query}` : ''
      }`
    );
    return this.normalizeStackResponse(response);
  }

  async toggleStackFavorite(
    stackId: string | number,
    favorited: boolean
  ): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(`/api/v1/stacks/${stackId}/favorite`, {
      method: 'PUT',
      body: JSON.stringify({ favorited }),
    });
  }

  async likeStack(stackId: string | number): Promise<{ success: boolean; liked: number }> {
    return this.fetch<{ success: boolean; liked: number }>(`/api/v1/stacks/${stackId}/like`, {
      method: 'POST',
    });
  }

  // Asset APIs
  async getAssets(datasetId: string, stackId: string): Promise<Asset[]> {
    return this.fetch<Asset[]>(`/api/v1/datasets/${datasetId}/stacks/${stackId}/assets`);
  }

  async removeAsset(assetId: string | number): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(`/api/v1/assets/${assetId}`, {
      method: 'DELETE',
    });
  }

  private normalizeStackResponse(response: StackPaginatedResponse): StackPaginatedResponse {
    return {
      ...response,
      stacks: Array.isArray(response.stacks)
        ? response.stacks.map((stack) => this.normalizeStack(stack))
        : response.stacks,
    };
  }

  private normalizeStack(stack: Stack): Stack {
    const likedRaw = (stack as any).liked ?? (stack as any).likeCount ?? 0;
    const liked = typeof likedRaw === 'number' ? likedRaw : Number(likedRaw) || 0;

    const likeCountRaw = (stack as any).likeCount ?? liked;
    const likeCount = typeof likeCountRaw === 'number' ? likeCountRaw : Number(likeCountRaw) || 0;

    const favoritedRaw = (stack as any).favorited ?? (stack as any).isFavorite ?? false;
    const favorited = Boolean(favoritedRaw);

    const assetCountRaw =
      (stack as any).assetCount ??
      (stack as any).assetsCount ??
      (Array.isArray((stack as any).assets) ? (stack as any).assets.length : undefined);
    const assetCount =
      typeof assetCountRaw === 'number' ? assetCountRaw : Number(assetCountRaw) || 0;

    return {
      ...stack,
      liked,
      likeCount,
      favorited,
      isFavorite: favorited,
      assetCount,
      assetsCount: assetCount,
    };
  }

  async updateAssetOrder(assetId: string | number, order: number): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(`/api/v1/assets/${assetId}/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    });
  }

  // Update asset metadata (e.g., video markers)
  async updateAssetMeta(params: {
    datasetId: string | number;
    stackId: string | number;
    assetId: string | number;
    meta: Record<string, any>;
  }): Promise<{ success?: boolean } & any> {
    const { datasetId, stackId, assetId, meta } = params;
    // Prefer dataset-scoped feature route; fall back to assets-lite if unavailable
    try {
      return await this.fetch(
        `/api/v1/datasets/${datasetId}/stacks/${stackId}/assets/${assetId}/meta`,
        {
          method: 'PUT',
          body: JSON.stringify(meta || {}),
        }
      );
    } catch (e) {
      try {
        // Fallback (legacy): /api/v1/assets/:assetId/meta
        return await this.fetch(`/api/v1/assets/${assetId}/meta`, {
          method: 'PUT',
          body: JSON.stringify(meta || {}),
        });
      } catch {
        // Last resort (very legacy): /assets/:assetId/meta
        return await this.fetch(`/assets/${assetId}/meta`, {
          method: 'PUT',
          body: JSON.stringify(meta || {}),
        });
      }
    }
  }

  // Collection APIs
  async getCollections(params?: {
    dataSetId?: number;
    type?: 'SMART' | 'MANUAL' | 'SCRATCH';
    limit?: number;
    offset?: number;
  }): Promise<{ collections: Collection[]; total: number; limit: number; offset: number }> {
    const queryParams = new URLSearchParams();
    if (params?.dataSetId) queryParams.append('dataSetId', String(params.dataSetId));
    if (params?.type) queryParams.append('type', params.type);
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.offset) queryParams.append('offset', String(params.offset));

    return this.fetch<{ collections: Collection[]; total: number; limit: number; offset: number }>(
      `/api/v1/collections?${queryParams}`
    );
  }

  async getCollection(collectionId: string | number): Promise<Collection> {
    return this.fetch<Collection>(`/api/v1/collections/${collectionId}`);
  }

  async createCollection(data: {
    name: string;
    icon?: string;
    description?: string;
    type?: 'SMART' | 'MANUAL' | 'SCRATCH';
    dataSetId: number;
    folderId?: number;
    filterConfig?: Record<string, any>;
  }): Promise<Collection> {
    return this.fetch<Collection>('/api/v1/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollection(
    collectionId: string | number,
    data: {
      name?: string;
      icon?: string;
      description?: string;
      type?: 'SMART' | 'MANUAL' | 'SCRATCH';
      folderId?: number | null;
      filterConfig?: Record<string, any>;
    }
  ): Promise<Collection> {
    return this.fetch<Collection>(`/api/v1/collections/${collectionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCollection(collectionId: string | number): Promise<void> {
    await this.fetch(`/api/v1/collections/${collectionId}`, {
      method: 'DELETE',
    });
  }

  async addStackToCollection(
    collectionId: string | number,
    stackId: number,
    orderIndex?: number
  ): Promise<void> {
    await this.fetch(`/api/v1/collections/${collectionId}/stacks`, {
      method: 'POST',
      body: JSON.stringify({ stackId, orderIndex }),
    });
  }

  async bulkAddStacksToCollection(
    collectionId: string | number,
    stackIds: number[]
  ): Promise<void> {
    await this.fetch(`/api/v1/collections/${collectionId}/stacks/bulk`, {
      method: 'POST',
      body: JSON.stringify({ stackIds }),
    });
  }

  async removeStackFromCollection(collectionId: string | number, stackId: number): Promise<void> {
    await this.fetch(`/api/v1/collections/${collectionId}/stacks/${stackId}`, {
      method: 'DELETE',
    });
  }

  async getCollectionStacks(
    collectionId: string | number,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<Array<{ stack: Stack; orderIndex: number }>> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    return this.fetch<Array<{ stack: Stack; orderIndex: number }>>(
      `/api/v1/collections/${collectionId}/stacks?${params}`
    );
  }

  async getSmartCollectionStacks(
    collectionId: number,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ stacks: Stack[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    return this.fetch<{ stacks: Stack[]; total: number }>(
      `/api/v1/collections/${collectionId}/smart-stacks?${params}`
    );
  }

  async getStackCollections(stackId: string | number): Promise<{ collectionIds: number[] }> {
    return this.fetch<{ collectionIds: number[] }>(`/api/v1/stacks/${stackId}/collections`);
  }

  async reorderStacksInCollection(
    collectionId: string | number,
    stackOrders: Array<{ stackId: number; orderIndex: number }>
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(`/api/v1/collections/${collectionId}/stacks/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ stackOrders }),
    });
  }

  // Tag APIs
  async searchTags(query: string, datasetId?: string): Promise<{ id: number; title: string }[]> {
    const params = new URLSearchParams({ key: query });
    if (datasetId) {
      params.append('dataSetId', datasetId);
    }
    return this.fetch<{ id: number; title: string }[]>(`/api/v1/tags/search?${params}`);
  }

  // Author APIs
  async searchAuthors(query: string, datasetId?: string): Promise<{ id: number; name: string }[]> {
    const params = new URLSearchParams({ key: query });
    if (datasetId) params.append('datasetId', datasetId);
    return this.fetch<{ id: number; name: string }[]>(`/api/v1/authors/search?${params}`);
  }

  async getAuthors(params: {
    datasetId: string | number;
    limit?: number;
    offset?: number;
  }): Promise<{
    authors: Array<{ id: number; name: string; stackCount?: number }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const query = new URLSearchParams();
    query.append('dataSetId', String(params.datasetId));
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    return this.fetch(`/api/v1/authors?${query.toString()}`);
  }

  // Bulk operations
  async bulkAddTags(
    stackIds: number[],
    tags: string[]
  ): Promise<{ success: boolean; updated: number }> {
    return this.fetch<{ success: boolean; updated: number }>('/api/v1/stacks/bulk/tags', {
      method: 'POST',
      body: JSON.stringify({ stackIds, tags }),
    });
  }

  async bulkSetAuthor(
    stackIds: number[],
    author: string
  ): Promise<{ success: boolean; updated: number }> {
    return this.fetch<{ success: boolean; updated: number }>('/api/v1/stacks/bulk/author', {
      method: 'PUT',
      body: JSON.stringify({ stackIds, author }),
    });
  }

  async bulkSetMediaType(
    stackIds: number[],
    mediaType: 'image' | 'comic' | 'video'
  ): Promise<{ success: boolean; updated: number }> {
    return this.fetch<{ success: boolean; updated: number }>('/api/v1/stacks/bulk/media-type', {
      method: 'PUT',
      body: JSON.stringify({ stackIds, mediaType }),
    });
  }

  async bulkSetFavorite(
    stackIds: number[],
    favorited: boolean
  ): Promise<{ success: boolean; updated: number }> {
    return this.fetch<{ success: boolean; updated: number }>('/api/v1/stacks/bulk/favorite', {
      method: 'PUT',
      body: JSON.stringify({ stackIds, favorited }),
    });
  }

  // Stack maintenance operations
  async refreshThumbnail(stackId: string | number): Promise<{ success: boolean; message: string }> {
    return this.fetch<{ success: boolean; message: string }>(
      `/api/v1/stacks/${stackId}/refresh-thumbnail`,
      {
        method: 'POST',
      }
    );
  }

  async regenerateStackPreview(params: {
    datasetId: string | number;
    stackId: string | number;
    force?: boolean;
  }): Promise<{
    success: boolean;
    totalAssets: number;
    eligible: number;
    regenerated: number;
    failed: number[];
  }> {
    const { datasetId, stackId, force } = params;
    const body = force === undefined ? {} : { force };
    return this.fetch<{
      success: boolean;
      totalAssets: number;
      eligible: number;
      regenerated: number;
      failed: number[];
    }>(`/api/v1/datasets/${datasetId}/stacks/${stackId}/regenerate-preview`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateStackColors(
    stackId: string | number
  ): Promise<{ success: boolean; colors?: any[]; message: string }> {
    return this.fetch<{ success: boolean; colors?: any[]; message: string }>(
      `/api/v1/colors/stacks/${stackId}/update-colors`,
      {
        method: 'POST',
      }
    );
  }

  async updateAllDatasetColors(
    datasetId: string | number
  ): Promise<{ success: boolean; totalStacks: number; message: string }> {
    return this.fetch<{ success: boolean; totalStacks: number; message: string }>(
      `/api/v1/colors/datasets/${datasetId}/update-all-colors`,
      {
        method: 'POST',
      }
    );
  }

  // Activity operations
  async getYearlyLikes(params: { year: number; datasetId?: string; search?: string }): Promise<{
    year: number;
    groupedByMonth: Record<
      string,
      Array<{
        id: string;
        stackId: string;
        createdAt: string;
        stack: Stack;
      }>
    >;
    totalItems: number;
    availableYears: number[];
  }> {
    const queryParams = new URLSearchParams();
    queryParams.append('year', String(params.year));
    if (params.datasetId) queryParams.append('datasetId', params.datasetId);
    if (params.search && params.search.trim()) queryParams.append('search', params.search.trim());
    return this.fetch<{
      year: number;
      groupedByMonth: Record<
        string,
        Array<{
          id: string;
          stackId: string;
          createdAt: string;
          stack: Stack;
        }>
      >;
      totalItems: number;
      availableYears: number[];
    }>(`/api/v1/activities/likes/yearly?${queryParams}`);
  }

  // AutoTag operations
  async regenerateDatasetAutoTags(
    datasetId: string | number,
    options?: {
      threshold?: number;
      batchSize?: number;
    }
  ): Promise<{
    datasetId: number;
    totalStacks: number;
    processedStacks: number;
    threshold: number;
    batchSize: number;
    message: string;
  }> {
    return this.fetch<{
      datasetId: number;
      totalStacks: number;
      processedStacks: number;
      threshold: number;
      batchSize: number;
      message: string;
    }>(`/api/v1/stacks/dataset/${datasetId}/aggregate-all-tags`, {
      method: 'POST',
      body: JSON.stringify({
        threshold: options?.threshold || 0.4,
        batchSize: options?.batchSize || 5,
      }),
    });
  }

  async aggregateStackTags(
    stackId: string | number,
    options?: {
      threshold?: number;
    }
  ): Promise<{
    stackId: number;
    aggregatedTags: Record<string, number>;
    topTags: Array<{ tag: string; score: number }>;
    assetCount: number;
    skippedAssets?: number;
  }> {
    return this.fetch<{
      stackId: number;
      aggregatedTags: Record<string, number>;
      topTags: Array<{ tag: string; score: number }>;
      assetCount: number;
      skippedAssets?: number;
    }>(`/api/v1/stacks/${stackId}/aggregate-tags`, {
      method: 'POST',
      body: JSON.stringify({
        threshold: options?.threshold || 0.4,
      }),
    });
  }

  async getColorStats(datasetId?: string | number): Promise<{
    totalStacks: number;
    totalWithColors: number;
    totalWithoutColors: number;
    totalAssets: number;
    colorCoverage: number;
  }> {
    const params = datasetId ? `?dataSetId=${datasetId}` : '';
    return this.fetch<{
      totalStacks: number;
      totalWithColors: number;
      totalWithoutColors: number;
      totalAssets: number;
      colorCoverage: number;
    }>(`/api/v1/colors/stats${params}`);
  }

  async searchByColorFilter(filter: {
    hueCategories?: string[];
    saturationRange?: { min: number; max: number };
    lightnessRange?: { min: number; max: number };
    dataSetId?: number;
    mediaType?: 'image' | 'comic' | 'video';
    limit?: number;
    offset?: number;
  }): Promise<{ stacks: any[]; total: number; limit: number; offset: number }> {
    return this.fetch<{ stacks: any[]; total: number; limit: number; offset: number }>(
      '/api/v1/colors/filter',
      {
        method: 'POST',
        body: JSON.stringify(filter),
      }
    );
  }

  async bulkRefreshThumbnails(
    stackIds: (string | number)[]
  ): Promise<{ success: boolean; updated: number; errors?: string[] }> {
    const numericIds = stackIds.map((id) =>
      typeof id === 'string' ? Number.parseInt(id, 10) : id
    );
    return this.fetch<{ success: boolean; updated: number; errors?: string[] }>(
      '/api/v1/stacks/bulk/refresh-thumbnails',
      {
        method: 'POST',
        body: JSON.stringify({ stackIds: numericIds }),
      }
    );
  }

  async removeStack(stackId: string | number): Promise<{ success: boolean; message: string }> {
    return this.fetch<{ success: boolean; message: string }>(`/api/v1/stacks/${stackId}`, {
      method: 'DELETE',
    });
  }

  async bulkRemoveStacks(
    stackIds: (string | number)[]
  ): Promise<{ success: boolean; removed: number; errors?: string[] }> {
    const numericIds = stackIds.map((id) =>
      typeof id === 'string' ? Number.parseInt(id, 10) : id
    );
    return this.fetch<{ success: boolean; removed: number; errors?: string[] }>(
      '/api/v1/stacks/bulk/remove',
      {
        method: 'DELETE',
        body: JSON.stringify({ stackIds: numericIds }),
      }
    );
  }

  async mergeStacks(
    targetId: number,
    sourceIds: (string | number)[]
  ): Promise<{ success: boolean; targetId: number; merged: number; stack?: any }> {
    const numericSources = sourceIds.map((id) =>
      typeof id === 'string' ? Number.parseInt(id, 10) : id
    );
    const res = await this.fetch<{
      success: boolean;
      targetId: number;
      merged: number;
      stack?: any;
    }>('/api/v1/stacks/merge', {
      method: 'POST',
      body: JSON.stringify({ targetId, sourceIds: numericSources }),
    });
    return res;
  }

  // Navigation Pin APIs
  async getNavigationPinsByDataset(datasetId: string | number): Promise<Pin[]> {
    console.log('Fetching navigation pins for dataset:', datasetId);
    return this.fetch<Pin[]>(`/api/v1/navigation-pins/dataset/${datasetId}`);
  }

  async createNavigationPin(data: {
    type: 'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW' | 'FAVORITES' | 'LIKES';
    name: string;
    icon: string;
    order: number;
    dataSetId: number;
    collectionId?: number;
    mediaType?: string;
  }): Promise<Pin> {
    console.log('Creating navigation pin with data:', data);
    return this.fetch<Pin>('/api/v1/navigation-pins', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNavigationPin(
    pinId: string | number,
    data: {
      name?: string;
      icon?: string;
      order?: number;
    }
  ): Promise<Pin> {
    return this.fetch<Pin>(`/api/v1/navigation-pins/${pinId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNavigationPin(pinId: string | number): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(`/api/v1/navigation-pins/${pinId}`, {
      method: 'DELETE',
    });
  }

  async updateNavigationPinOrder(
    pins: Array<{ id: number; order: number }>
  ): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>('/api/v1/navigation-pins/order', {
      method: 'PUT',
      body: JSON.stringify({ pins }),
    });
  }

  // Tag APIs
  async getTags(params: {
    datasetId?: string;
    orderBy?: string;
    orderDirection?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    tags: Array<{ id: number; title: string; name: string; _count?: { stacks: number } }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params.datasetId) queryParams.append('datasetId', params.datasetId);
    if (params.orderBy) queryParams.append('orderBy', params.orderBy);
    if (params.orderDirection) queryParams.append('orderDirection', params.orderDirection);
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.offset) queryParams.append('offset', String(params.offset));

    return this.fetch(`/api/v1/tags?${queryParams}`);
  }

  // AutoTag APIs
  async getAutoTagMappings(params: {
    datasetId: string | number;
    limit?: number;
    offset?: number;
  }): Promise<{
    mappings: Array<{
      id: number;
      autoTagKey: string;
      displayName?: string;
      description?: string;
      isActive: boolean;
      dataSetId: number;
      createdAt: string;
      updatedAt: string;
      tag?: { id: number; title: string };
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const { datasetId, limit, offset } = params;
    const queryParams = new URLSearchParams();
    if (limit !== undefined) queryParams.append('limit', String(limit));
    if (offset !== undefined) queryParams.append('offset', String(offset));
    return this.fetch(`/api/v1/auto-tags/mappings/${datasetId}?${queryParams.toString()}`);
  }

  async getAutoTagStatistics(params: {
    datasetId: string | number;
    limit?: number;
    threshold?: number;
    query?: string;
    source?: 'raw' | 'aggregate';
    includeTotal?: boolean;
  }): Promise<{
    datasetId: number;
    threshold: number;
    totalTags: number;
    totalPredictions?: number;
    tags: Array<{ autoTagKey: string; predictionCount: number; assetCount: number }>;
    method: string;
    cached?: boolean;
  }> {
    const { datasetId, limit, threshold, query, source, includeTotal } = params;
    const queryParams = new URLSearchParams();
    if (limit !== undefined) queryParams.append('limit', String(limit));
    if (threshold !== undefined) queryParams.append('threshold', String(threshold));
    if (query && query.trim()) queryParams.append('q', query.trim());
    if (source) queryParams.append('source', source);
    if (includeTotal !== undefined) queryParams.append('includeTotal', String(includeTotal));
    return this.fetch(`/api/v1/auto-tags/statistics/${datasetId}?${queryParams.toString()}`);
  }

  async searchStacksByAutoTag(params: {
    datasetId: string | number;
    autoTag: string | string[];
    limit?: number;
    offset?: number;
    search?: string;
    filter?: StackFilter;
  }): Promise<{ stacks: any[]; total: number; limit: number; offset: number }> {
    const query = new URLSearchParams();
    query.append('dataSetId', String(params.datasetId));
    const tags = Array.isArray(params.autoTag) ? params.autoTag : [params.autoTag];
    tags.forEach((t) => query.append('autoTag', t));
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.offset !== undefined) query.append('offset', String(params.offset));
    if (params.search && params.search.trim()) query.append('search', params.search.trim());
    // Map additional filters
    const f = params.filter;
    if (f) {
      if (f.mediaType) query.append('mediaType', f.mediaType);
      if (f.isFavorite === true) query.append('fav', '1');
      if (f.isFavorite === false) query.append('fav', '0');
      if (f.isLiked === true) query.append('liked', '1');
      if (f.isLiked === false) query.append('liked', '0');
      if (f.hasNoTags !== undefined) query.append('hasNoTags', String(f.hasNoTags));
      if (f.hasNoAuthor !== undefined) query.append('hasNoAuthor', String(f.hasNoAuthor));
      if (Array.isArray(f.authors)) f.authors.forEach((a) => query.append('author', a));
      if (Array.isArray(f.tags)) f.tags.forEach((t) => query.append('tag', t));
      // Note: colorFilter not supported on this endpoint (server ignores it)
    }
    return this.fetch(`/api/v1/stacks/search/autotag?${query.toString()}`);
  }

  // Upload APIs
  async createStackWithFile(
    file: File,
    options?: {
      name?: string;
      datasetId?: string;
      mediaType?: string;
      tags?: string[];
      author?: string;
      onProgress?: (progress: number) => void;
    }
  ): Promise<Stack> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.name) formData.append('name', options.name);
    if (options?.datasetId) formData.append('dataSetId', options.datasetId);
    if (options?.mediaType) formData.append('mediaType', options.mediaType);
    if (options?.author) formData.append('author', options.author);
    if (options?.tags) {
      options.tags.forEach((tag) => formData.append('tags[]', tag));
    }

    // Auto-detect mediaType from file type if not provided
    if (!options?.mediaType) {
      const mimeType = file.type.toLowerCase();
      const inferredMediaType = mimeType.startsWith('video/')
        ? 'video'
        : mimeType === 'application/pdf'
          ? 'comic'
          : 'image';
      formData.append('mediaType', inferredMediaType);
    }

    return this.uploadFile<Stack>('/api/v1/stacks', formData, options?.onProgress);
  }

  async addAssetToStack(
    stackId: string | number,
    file: File,
    options?: {
      onProgress?: (progress: number) => void;
    }
  ): Promise<Asset> {
    const formData = new FormData();
    formData.append('file', file);

    return this.uploadFile<Asset>(
      `/api/v1/stacks/${stackId}/assets`,
      formData,
      options?.onProgress
    );
  }

  async importAssetsFromUrls(params: {
    urls: string[];
    dataSetId?: number;
    stackId?: number;
    mediaType?: string;
    collectionId?: number;
    author?: string;
    tags?: string[];
  }): Promise<{ results: ImportUrlResult[] }> {
    const response = await this.post<{ results: ImportUrlResult[] }>(
      '/api/v1/stacks/import-from-urls',
      params
    );
    return response.data;
  }

  async setUploadDefaults(defaults: {
    datasetId?: string;
    mediaType?: string;
    tags?: string[];
    author?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>('/api/v1/upload/defaults', {
      method: 'PUT',
      body: JSON.stringify(defaults),
    });
  }

  // Collection Folder APIs
  async getCollectionFolders(params: {
    dataSetId?: number;
    parentId?: number;
    includeCollections?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    folders: CollectionFolder[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params.dataSetId !== undefined) queryParams.append('dataSetId', String(params.dataSetId));
    if (params.parentId !== undefined) queryParams.append('parentId', String(params.parentId));
    if (params.includeCollections !== undefined)
      queryParams.append('includeCollections', String(params.includeCollections));
    if (params.limit !== undefined) queryParams.append('limit', String(params.limit));
    if (params.offset !== undefined) queryParams.append('offset', String(params.offset));

    const query = queryParams.toString();
    return this.fetch<{
      folders: CollectionFolder[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/v1/collection-folders${query ? `?${query}` : ''}`);
  }

  async getCollectionFolderTree(params: {
    dataSetId: number;
    includeCollections?: boolean;
  }): Promise<{
    folders: CollectionFolder[];
    rootCollections: Collection[];
  }> {
    const queryParams = new URLSearchParams();
    queryParams.append('dataSetId', String(params.dataSetId));
    if (params.includeCollections !== undefined)
      queryParams.append('includeCollections', String(params.includeCollections));

    return this.fetch<{
      folders: CollectionFolder[];
      rootCollections: Collection[];
    }>(`/api/v1/collection-folders/tree?${queryParams.toString()}`);
  }

  async getCollectionFolder(id: number): Promise<CollectionFolder> {
    return this.fetch<CollectionFolder>(`/api/v1/collection-folders/${id}`);
  }

  async createCollectionFolder(data: {
    name: string;
    icon?: string;
    description?: string;
    dataSetId: number;
    parentId?: number;
    order?: number;
  }): Promise<CollectionFolder> {
    return this.fetch<CollectionFolder>('/api/v1/collection-folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollectionFolder(
    id: number,
    data: {
      name?: string;
      icon?: string;
      description?: string;
      parentId?: number;
      order?: number;
    }
  ): Promise<CollectionFolder> {
    return this.fetch<CollectionFolder>(`/api/v1/collection-folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCollectionFolder(id: number): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(`/api/v1/collection-folders/${id}`, {
      method: 'DELETE',
    });
  }

  async moveCollectionFolder(id: number, newParentId?: number): Promise<CollectionFolder> {
    return this.fetch<CollectionFolder>(`/api/v1/collection-folders/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ newParentId }),
    });
  }

  async reorderCollectionFolders(
    id: number,
    parentId: number | null,
    folderOrders: Array<{ folderId: number; order: number }>
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(`/api/v1/collection-folders/${id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ parentId, folderOrders }),
    });
  }

  private async uploadFile<T>(
    path: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        const status = xhr.status;
        const text = xhr.responseText || '';
        if (status >= 200 && status < 300) {
          try {
            const response = JSON.parse(text);
            resolve(response);
          } catch {
            reject(new Error('Invalid JSON response'));
          }
          return;
        }

        // 失敗時は可能であればJSON本文からエラーメッセージを抽出
        try {
          const data = text ? JSON.parse(text) : {};
          const message =
            data?.message || data?.error || `Upload failed: ${status} ${xhr.statusText}`;
          reject(new Error(message));
        } catch {
          reject(new Error(`Upload failed: ${status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed: Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', `${this.baseUrl}${path}`);
      xhr.send(formData);
    });
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string>),
    };

    // Only set Content-Type for requests with body
    if (options?.body) {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${this.baseUrl}${path}`;
    console.log('API Request:', options?.method || 'GET', url, options?.body);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Search and Embedding methods
  async generateAllEmbeddings(params: {
    datasetId: number;
    type?: 'text' | 'clip' | 'all';
    batchSize?: number;
    forceRegenerate?: boolean;
  }): Promise<{
    message: string;
    datasetId: number;
    totalCount: number;
    queued: number;
    type: string;
    batchSize: number;
    forceRegenerate: boolean;
  }> {
    return this.fetch('/api/v1/search/generate-all-embeddings', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getEmbeddingQueueStatus(): Promise<{
    queue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    workerEnabled: boolean;
    workerConcurrency: number;
  }> {
    return this.fetch('/api/v1/search/queue-status');
  }

  async runDatasetAIAnalysis(
    datasetId: string,
    params: {
      forceRegenerate?: boolean;
      batchSize?: number;
    }
  ): Promise<{ totalCount: number; queued: number; message: string }> {
    const queryParams = new URLSearchParams();
    if (params.forceRegenerate)
      queryParams.append('forceRegenerate', String(params.forceRegenerate));
    if (params.batchSize) queryParams.append('batchSize', String(params.batchSize));

    const query = queryParams.toString();
    const response = await this.fetch<{ totalCount: number; queued: number; message: string }>(
      `/api/v1/datasets/${datasetId}/ai-analysis${query ? `?${query}` : ''}`,
      {
        method: 'POST',
      }
    );
    return response;
  }

  async runDatasetRefreshAll(
    datasetId: string,
    params: {
      forceRegenerate?: boolean;
      batchSize?: number;
    }
  ): Promise<{
    message: string;
    datasetId: number;
    totalStacks: number;
    scheduled: { thumbnails: number; colors: number; autotags: number; embeddings: number };
    totals: { embeddings: number };
  }> {
    const queryParams = new URLSearchParams();
    if (params.forceRegenerate)
      queryParams.append('forceRegenerate', String(params.forceRegenerate));
    if (params.batchSize) queryParams.append('batchSize', String(params.batchSize));

    const query = queryParams.toString();
    return this.fetch(`/api/v1/datasets/${datasetId}/refresh-all${query ? `?${query}` : ''}`, {
      method: 'POST',
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
