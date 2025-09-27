import type { PrismaClient, Stack } from '@prisma/client';
import { ensureSuperUser } from '../../../shared/services/UserService';
import type { createColorSearchService } from './color-search-service';
import type { createTagStatsService } from './tag-stats-service';

const DEFAULT_AUTO_STOP_TAGS = [
  '1girl',
  '1boy',
  'solo',
  'rating:safe',
  'safe',
  'highres',
  'long_hair',
  'short_hair',
  'looking_at_viewer',
  'smile',
  'simple_background',
  'multiple_views',
];

const STOP_TAG_CACHE_TTL_MS = 5 * 60 * 1000;

const SIMILAR_CONFIG = {
  autoTopN: 30,
  autoProbeCount: 8,
  autoMinScore: 0.55,
  manualTopN: 60,
  minAutoOverlap: 2,
  minManualOverlap: 1,
  candidateLimit: 1500,
  resultLimit: 1000,
  autoWeight: 1.0,
  manualWeight: 1.2,
  manualWeightMultiplierOnIdf: 1.0,
  minIdf: 0.05,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const normalizeTag = (tag: string) => tag.trim().toLowerCase();

type AutoTagVector = Map<string, number>;
type ManualTagSet = Set<string>;

interface SimilarVectors {
  auto: AutoTagVector;
  manual: ManualTagSet;
}

interface CandidateVectors extends SimilarVectors {
  stackId: number;
}

interface SimilarSearchResult {
  stackIds: number[];
  scores: Map<number, number>;
}

const extractAutoTagVector = (
  raw: unknown,
  options: { limit: number; minScore: number; stopTags: Set<string> }
): AutoTagVector => {
  const { limit, minScore, stopTags } = options;
  if (!raw || !Array.isArray(raw)) return new Map();

  const entries: Array<{ tag: string; score: number }> = [];
  for (const item of raw as Array<any>) {
    if (!item || typeof item !== 'object') continue;
    const tagValue = 'tag' in item ? item.tag : item.autoTagKey;
    const scoreValue = 'score' in item ? item.score : (item.value ?? item.weight);
    if (typeof tagValue !== 'string') continue;
    const score = typeof scoreValue === 'number' ? scoreValue : Number(scoreValue);
    if (!Number.isFinite(score) || score < minScore) continue;
    const normalized = normalizeTag(tagValue);
    if (!normalized || stopTags.has(normalized)) continue;
    entries.push({ tag: normalized, score });
  }

  entries.sort((a, b) => b.score - a.score);
  if (entries.length > limit) entries.length = limit;

  const map: AutoTagVector = new Map();
  for (const entry of entries) {
    if (!map.has(entry.tag)) {
      map.set(entry.tag, entry.score);
    }
  }
  return map;
};

const filterManualTags = (
  tags: Iterable<string>,
  options: { stopTags: Set<string>; limit: number }
): ManualTagSet => {
  const { stopTags, limit } = options;
  const set: ManualTagSet = new Set();
  for (const tag of tags) {
    if (set.size >= limit) break;
    if (typeof tag !== 'string') continue;
    const normalized = normalizeTag(tag);
    if (!normalized || stopTags.has(normalized)) continue;
    set.add(normalized);
  }
  return set;
};
// Embedding/vector search removed. Similarity uses AutoTag aggregates.

// 検索モード
export enum SearchMode {
  ALL = 'all', // 全体検索
  SIMILAR = 'similar', // 類似検索（ReferenceStackId）
  UNIFIED = 'unified', // フリーワード検索
}

// 検索リクエスト
export interface SearchRequest {
  mode: SearchMode;
  datasetId: number;

  // モード別パラメータ
  referenceStackId?: number; // SIMILAR mode
  query?: string; // UNIFIED mode
  similar?: SimilarSearchOptions;

  // 共通フィルタ
  filters: SearchFilters;
  sort: SortOptions;
  pagination: PaginationOptions;
}

export interface SimilarSearchOptions {
  threshold?: number;
}

// フィルタオプション
export interface SearchFilters {
  author?: AuthorFilter;
  tags?: TagFilter;
  favorites?: 'is-fav' | 'not-fav';
  likes?: 'is-liked' | 'not-liked';
  color?: ColorFilter;
  mediaType?: 'all' | 'image' | 'comic' | 'video';
  collectionId?: number;
  includeAutoTags?: boolean;
}

// 作者フィルタ
export interface AuthorFilter {
  include?: string[]; // AND条件
  includeAny?: string[]; // OR条件（+ワード）
  exclude?: string[]; // NOT条件（-ワード）
  includeNotSet?: boolean;
}

// タグフィルタ
export interface TagFilter {
  include?: string[]; // AND条件
  includeAny?: string[]; // OR条件（+ワード）
  exclude?: string[]; // NOT条件（-ワード）
  includeNotSet?: boolean;
}

// 色フィルタ
export interface ColorFilter {
  hue?: number;
  hex?: string;
  tones?: {
    brightness?: { min?: number; max?: number };
    saturation?: { min?: number; max?: number };
  };
}

// ソートオプション
export interface SortOptions {
  by: 'recommended' | 'dateAdded' | 'name' | 'likes' | 'updated';
  order: 'asc' | 'desc';
}

// ページネーションオプション
export interface PaginationOptions {
  limit: number;
  offset: number;
}

// 検索結果
export interface SearchResult {
  stacks: Stack[];
  total: number;
  limit: number;
  offset: number;
}

export const createSearchService = (deps: {
  prisma: PrismaClient;
  colorSearch: ReturnType<typeof createColorSearchService>;
  tagStats: ReturnType<typeof createTagStatsService>;
  dataSetId: number;
}) => {
  const { prisma, dataSetId, colorSearch, tagStats } = deps;

  let stopTagsCache: { value: Set<string>; expiresAt: number } | null = null;

  const now = () => Date.now();

  const getStopTags = async (): Promise<Set<string>> => {
    if (stopTagsCache && stopTagsCache.expiresAt >= now()) {
      return stopTagsCache.value;
    }

    const base = new Set(DEFAULT_AUTO_STOP_TAGS.map(normalizeTag));

    const rows = await prisma.autoTagMapping.findMany({
      where: { dataSetId, isActive: true, isStop: true },
      select: { autoTagKey: true },
    });

    for (const row of rows) {
      if (row.autoTagKey) {
        base.add(normalizeTag(row.autoTagKey));
      }
    }

    stopTagsCache = { value: base, expiresAt: now() + STOP_TAG_CACHE_TTL_MS };
    return base;
  };

  const fetchManualTagSets = async (
    stackIds: number[],
    stopTags: Set<string>
  ): Promise<Map<number, ManualTagSet>> => {
    if (!stackIds.length) return new Map();

    const rows = await prisma.tagsOnStack.findMany({
      where: { stackId: { in: stackIds } },
      include: { tag: { select: { title: true } } },
    });

    const map = new Map<number, ManualTagSet>();
    for (const row of rows) {
      const title = row.tag?.title;
      if (typeof title !== 'string') continue;
      const normalized = normalizeTag(title);
      if (!normalized || stopTags.has(normalized)) continue;
      if (!map.has(row.stackId)) {
        map.set(row.stackId, new Set());
      }
      const set = map.get(row.stackId)!;
      if (set.size >= SIMILAR_CONFIG.manualTopN) continue;
      set.add(normalized);
    }
    return map;
  };

  const fetchAutoCandidates = async (
    tags: string[],
    referenceStackId: number
  ): Promise<Array<{ stackId: number; shared: number }>> => {
    if (!tags.length) return [];

    const overlap =
      tags.length >= SIMILAR_CONFIG.minAutoOverlap ? SIMILAR_CONFIG.minAutoOverlap : 1;

    const query = `
      SELECT agg."stackId" AS "stackId",
             COUNT(*)::int AS shared
        FROM "StackAutoTagAggregate" agg
        JOIN "Stack" s ON s.id = agg."stackId"
        JOIN LATERAL jsonb_array_elements(agg."topTags"::jsonb) elem ON TRUE
       WHERE s."dataSetId" = $1
         AND agg."stackId" <> $3
         AND LOWER(elem->>'tag') = ANY($2::text[])
         AND (elem->>'score')::float >= $4
       GROUP BY agg."stackId"
      HAVING COUNT(*) >= $5
       ORDER BY shared DESC
       LIMIT $6
    `;

    return prisma.$queryRawUnsafe<Array<{ stackId: number; shared: number }>>(
      query,
      dataSetId,
      tags,
      referenceStackId,
      SIMILAR_CONFIG.autoMinScore,
      overlap,
      SIMILAR_CONFIG.candidateLimit
    );
  };

  const fetchManualCandidates = async (
    tags: string[],
    referenceStackId: number
  ): Promise<Array<{ stackId: number; shared: number }>> => {
    if (!tags.length) return [];

    const overlap =
      tags.length >= SIMILAR_CONFIG.minManualOverlap ? SIMILAR_CONFIG.minManualOverlap : 1;

    const query = `
      SELECT tos."stackId" AS "stackId",
             COUNT(*)::int AS shared
        FROM "TagsOnStack" tos
        JOIN "Tag" t ON t.id = tos."tagId"
        JOIN "Stack" s ON s.id = tos."stackId"
       WHERE s."dataSetId" = $1
         AND tos."stackId" <> $3
         AND LOWER(t.title) = ANY($2::text[])
       GROUP BY tos."stackId"
      HAVING COUNT(*) >= $4
       ORDER BY shared DESC
       LIMIT $5
    `;

    return prisma.$queryRawUnsafe<Array<{ stackId: number; shared: number }>>(
      query,
      dataSetId,
      tags,
      referenceStackId,
      overlap,
      SIMILAR_CONFIG.candidateLimit
    );
  };

  const computeIdfWeight = (
    tag: string,
    hasManual: boolean,
    autoDf: Map<string, number>,
    manualDf: Map<string, number>,
    datasetSize: number
  ): number => {
    const dfAuto = autoDf.get(tag) ?? 0;
    let df = dfAuto;
    if (df === 0 && hasManual) {
      df = manualDf.get(tag) ?? 0;
    }

    const numerator = Math.max(datasetSize, 1) + 1;
    const denominator = df + 1;
    const base = Math.log(numerator / denominator);
    const weight = Number.isFinite(base)
      ? Math.max(base, SIMILAR_CONFIG.minIdf)
      : SIMILAR_CONFIG.minIdf;
    return hasManual ? weight * SIMILAR_CONFIG.manualWeightMultiplierOnIdf : weight;
  };

  const runSimilarSearch = async (request: SearchRequest): Promise<SimilarSearchResult> => {
    if (!request.referenceStackId) {
      throw new Error('referenceStackId is required for similar search');
    }

    const stopTags = await getStopTags();

    const refAggregate = await prisma.stackAutoTagAggregate.findUnique({
      where: { stackId: request.referenceStackId },
      select: { topTags: true },
    });

    if (!refAggregate?.topTags) {
      return { stackIds: [], scores: new Map() };
    }

    const refAuto = extractAutoTagVector(refAggregate.topTags, {
      limit: SIMILAR_CONFIG.autoTopN,
      minScore: SIMILAR_CONFIG.autoMinScore,
      stopTags,
    });

    const refManualMap = await fetchManualTagSets([request.referenceStackId], stopTags);
    const refManual = refManualMap.get(request.referenceStackId) ?? new Set<string>();

    if (refAuto.size === 0 && refManual.size === 0) {
      return { stackIds: [], scores: new Map() };
    }

    const autoProbe = Array.from(refAuto.keys()).slice(0, SIMILAR_CONFIG.autoProbeCount);
    const manualProbe = Array.from(refManual.values());

    const [autoCandidates, manualCandidates] = await Promise.all([
      fetchAutoCandidates(autoProbe, request.referenceStackId),
      fetchManualCandidates(manualProbe, request.referenceStackId),
    ]);

    const candidateIdSet = new Set<number>();
    for (const row of autoCandidates) candidateIdSet.add(row.stackId);
    for (const row of manualCandidates) candidateIdSet.add(row.stackId);

    if (!candidateIdSet.size) {
      return { stackIds: [], scores: new Map() };
    }

    const candidateIds = Array.from(candidateIdSet);

    const [candidateAggregates, candidateManualMap] = await Promise.all([
      prisma.stackAutoTagAggregate.findMany({
        where: { stackId: { in: candidateIds } },
        select: { stackId: true, topTags: true },
      }),
      fetchManualTagSets(candidateIds, stopTags),
    ]);

    const candidates: CandidateVectors[] = [];
    const autoUniverse = new Set<string>(refAuto.keys());
    const manualUniverse = new Set<string>(refManual);

    for (const agg of candidateAggregates) {
      const auto = extractAutoTagVector(agg.topTags, {
        limit: SIMILAR_CONFIG.autoTopN,
        minScore: SIMILAR_CONFIG.autoMinScore,
        stopTags,
      });
      const manual = candidateManualMap.get(agg.stackId) ?? new Set<string>();
      if (auto.size === 0 && manual.size === 0) continue;
      candidates.push({ stackId: agg.stackId, auto, manual });
      for (const key of auto.keys()) autoUniverse.add(key);
      for (const key of manual) manualUniverse.add(key);
    }

    if (!candidates.length) {
      return { stackIds: [], scores: new Map() };
    }

    const [datasetSize, autoDfMap, manualDfMap] = await Promise.all([
      tagStats.getDatasetStackCount(),
      autoUniverse.size
        ? tagStats.getAutoTagDocumentFrequency(
            Array.from(autoUniverse),
            SIMILAR_CONFIG.autoMinScore
          )
        : Promise.resolve(new Map<string, number>()),
      manualUniverse.size
        ? tagStats.getManualTagDocumentFrequency(Array.from(manualUniverse))
        : Promise.resolve(new Map<string, number>()),
    ]);

    const scores = new Map<number, number>();

    for (const candidate of candidates) {
      const union = new Set<string>([
        ...refAuto.keys(),
        ...candidate.auto.keys(),
        ...refManual,
        ...candidate.manual,
      ]);

      let numerator = 0;
      let denominator = 0;

      for (const tag of union) {
        const refAutoVal = refAuto.get(tag) ?? 0;
        const candAutoVal = candidate.auto.get(tag) ?? 0;
        const refManualVal = refManual.has(tag) ? 1 : 0;
        const candManualVal = candidate.manual.has(tag) ? 1 : 0;

        if (!refAutoVal && !candAutoVal && !refManualVal && !candManualVal) continue;

        const refValue =
          SIMILAR_CONFIG.autoWeight * refAutoVal + SIMILAR_CONFIG.manualWeight * refManualVal;
        const candValue =
          SIMILAR_CONFIG.autoWeight * candAutoVal + SIMILAR_CONFIG.manualWeight * candManualVal;
        if (!refValue && !candValue) continue;

        const weight = computeIdfWeight(
          tag,
          !!(refManualVal || candManualVal),
          autoDfMap,
          manualDfMap,
          datasetSize
        );

        numerator += weight * Math.min(refValue, candValue);
        denominator += weight * Math.max(refValue, candValue);
      }

      const score = denominator > 0 ? numerator / denominator : 0;
      if (score > 0) {
        scores.set(candidate.stackId, score);
      }
    }

    const threshold = clamp01(request.similar?.threshold ?? 0);

    const sorted = Array.from(scores.entries())
      .filter(([, score]) => score >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, SIMILAR_CONFIG.resultLimit);

    return {
      stackIds: sorted.map(([id]) => id),
      scores: new Map(sorted),
    };
  };

  return {
    async search(request: SearchRequest): Promise<SearchResult> {
      // データセットIDの検証
      if (request.datasetId !== dataSetId) {
        throw new Error('Dataset ID mismatch');
      }

      let stackIds: number[];
      let scores: Map<number, number> | undefined;

      // 1. 検索モードによる初期絞り込み
      switch (request.mode) {
        case SearchMode.ALL:
          // 全件対象（データセット内のすべてのスタック）
          stackIds = await this.getAllStackIds();
          break;

        case SearchMode.SIMILAR: {
          const result = await runSimilarSearch(request);
          stackIds = result.stackIds;
          scores = result.scores;
          break;
        }

        case SearchMode.UNIFIED:
          // フリーワード検索
          if (!request.query) {
            throw new Error('query is required for unified search');
          }
          const unified = await this.performUnifiedSearch(request.query);
          stackIds = unified.map((r) => r.stackId);
          scores = new Map(unified.map((r) => [r.stackId, r.score]));
          break;
      }

      // 2. フィルタ適用
      const filtered = await this.applyFilters(stackIds, request.filters);

      // 3. ソート
      const sorted = await this.sortStacks(filtered, request.sort, scores);

      // 4. 全件数の取得
      const total = sorted.length;

      // 5. ページネーション
      const paginated = sorted.slice(
        request.pagination.offset,
        request.pagination.offset + request.pagination.limit
      );

      // 6. スタック情報の取得
      const stacks = await this.getStacksByIds(paginated);

      return {
        stacks,
        total,
        limit: request.pagination.limit,
        offset: request.pagination.offset,
      };
    },

    async getAllStackIds(): Promise<number[]> {
      const stacks = await prisma.stack.findMany({
        where: { dataSetId },
        select: { id: true },
      });
      return stacks.map((s) => s.id);
    },

    async performUnifiedSearch(query: string): Promise<Array<{ stackId: number; score: number }>> {
      // 対象: 作者名・手動タグ・オートタグ（Stack名や埋め込みは対象外）
      const normalize = (s: string) => s.replace(/\u3000/g, ' ').trim();
      const q = normalize(query);
      if (!q) return [];

      const rawTokens = q.split(/\s+/).filter(Boolean);
      const posTokens = rawTokens.filter((t) => !t.startsWith('-'));
      const negTokens = rawTokens
        .filter((t) => t.startsWith('-'))
        .map((t) => t.slice(1))
        .map((t) => t.trim())
        .filter(Boolean);

      // ソース重み（recommendedのスコア用）
      const WEIGHTS = {
        author: 0.95,
        autotag: 0.9,
        tag: 0.85,
      } as const;

      // ヘルパ: 1トークンに対する候補集合とスコアマップを返す
      const queryOneToken = async (token: string) => {
        const tokenLc = token.toLowerCase();
        const likePattern = `%${tokenLc}%`;

        // 作者名
        const authorRows = await prisma.stack.findMany({
          where: {
            dataSetId,
            author: {
              name: { contains: token, mode: 'insensitive' },
            },
          },
          select: { id: true },
          take: 3000,
        });

        // 手動タグ
        const tagRows = await prisma.stack.findMany({
          where: {
            dataSetId,
            tags: {
              some: {
                tag: {
                  dataSetId,
                  title: { contains: token, mode: 'insensitive' },
                },
              },
            },
          },
          select: { id: true },
          take: 3000,
        });

        // オートタグ（topTags と AutoTagMapping.displayName の両方を対象）
        const autoTagRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
          `SELECT s.id
             FROM "Stack" s
             JOIN "StackAutoTagAggregate" agg ON agg."stackId" = s.id
             JOIN LATERAL jsonb_array_elements(agg."topTags"::jsonb) elem ON true
             LEFT JOIN "AutoTagMapping" m
                    ON m."dataSetId" = s."dataSetId"
                   AND m."isActive" = true
                   AND lower(m."autoTagKey") = lower(elem->>'tag')
            WHERE s."dataSetId" = $1
              AND (
                    lower(elem->>'tag') LIKE $2
                 OR lower(COALESCE(m."displayName", '')) LIKE $2
                  )
              AND (elem->>'score')::float >= $3
            LIMIT $4`,
          dataSetId,
          likePattern,
          0.4,
          5000
        );

        const idSet = new Set<number>();
        const scoreMap = new Map<number, number>();

        for (const r of authorRows) {
          idSet.add(r.id);
          scoreMap.set(r.id, Math.max(scoreMap.get(r.id) || 0, WEIGHTS.author));
        }
        for (const r of tagRows) {
          idSet.add(r.id);
          scoreMap.set(r.id, Math.max(scoreMap.get(r.id) || 0, WEIGHTS.tag));
        }
        for (const r of autoTagRows) {
          idSet.add(r.id);
          scoreMap.set(r.id, Math.max(scoreMap.get(r.id) || 0, WEIGHTS.autotag));
        }

        return { idSet, scoreMap };
      };

      // 正トークンの処理
      let candidateSet: Set<number> | null = null;
      const perTokenScores: Array<Map<number, number>> = [];

      if (posTokens.length === 0) {
        // NOTのみ: 全件から除外していく
        candidateSet = new Set(await this.getAllStackIds());
      } else {
        for (let i = 0; i < posTokens.length; i++) {
          const t = posTokens[i];
          const { idSet, scoreMap } = await queryOneToken(t);
          perTokenScores.push(scoreMap);
          if (i === 0) {
            candidateSet = new Set(idSet);
          } else {
            // 積集合（AND）
            const next = new Set<number>();
            for (const id of candidateSet!) if (idSet.has(id)) next.add(id);
            candidateSet = next;
          }
          if (candidateSet.size === 0) break; // 早期終了
        }
      }

      if (!candidateSet || candidateSet.size === 0) {
        return [];
      }

      // NOTトークンの処理（いずれか一致するIDを除外）
      for (const t of negTokens) {
        const { idSet } = await queryOneToken(t);
        for (const id of idSet) candidateSet.delete(id);
      }

      if (candidateSet.size === 0) return [];

      // スコア集計（正トークンのみ、トークンごとに最大重み、合算）
      const finalScores = new Map<number, number>();
      if (posTokens.length === 0) {
        for (const id of candidateSet) finalScores.set(id, 0);
      } else {
        for (const id of candidateSet) {
          let sum = 0;
          for (const map of perTokenScores) sum += map.get(id) || 0;
          finalScores.set(id, sum);
        }
      }

      return Array.from(candidateSet)
        .map((id) => ({ stackId: id, score: finalScores.get(id) || 0 }))
        .sort((a, b) => b.score - a.score);
    },

    async applyFilters(stackIds: number[], filters: SearchFilters): Promise<number[]> {
      let filtered = new Set(stackIds);

      // 作者フィルタ
      if (filters.author) {
        const authorFiltered = await this.filterByAuthor(Array.from(filtered), filters.author);
        filtered = new Set(authorFiltered);
      }

      // タグフィルタ
      if (filters.tags) {
        const tagFiltered = await this.filterByTags(Array.from(filtered), filters.tags);
        filtered = new Set(tagFiltered);
      }

      // お気に入りフィルタ
      if (filters.favorites) {
        const favFiltered = await this.filterByFavorites(Array.from(filtered), filters.favorites);
        filtered = new Set(favFiltered);
      }

      // いいねフィルタ
      if (filters.likes) {
        const likeFiltered = await this.filterByLikes(Array.from(filtered), filters.likes);
        filtered = new Set(likeFiltered);
      }

      // 色フィルタ
      if (filters.color) {
        const colorFiltered = await this.filterByColor(Array.from(filtered), filters.color);
        filtered = new Set(colorFiltered);
      }

      // メディアタイプフィルタ
      if (filters.mediaType && filters.mediaType !== 'all') {
        const mediaFiltered = await this.filterByMediaType(Array.from(filtered), filters.mediaType);
        filtered = new Set(mediaFiltered);
      }

      // コレクションフィルタ
      if (filters.collectionId) {
        const collectionFiltered = await this.filterByCollection(
          Array.from(filtered),
          filters.collectionId
        );
        filtered = new Set(collectionFiltered);
      }

      return Array.from(filtered);
    },

    async filterByAuthor(stackIds: number[], filter: AuthorFilter): Promise<number[]> {
      const conditions: any[] = [];

      // AND条件
      if (filter.include?.length) {
        for (const authorName of filter.include) {
          conditions.push({
            author: { name: authorName },
          });
        }
      }

      // OR条件
      if (filter.includeAny?.length) {
        conditions.push({
          author: {
            name: { in: filter.includeAny },
          },
        });
      }

      // NOT条件
      if (filter.exclude?.length) {
        conditions.push({
          NOT: {
            author: {
              name: { in: filter.exclude },
            },
          },
        });
      }

      // Not Set条件
      if (filter.includeNotSet) {
        conditions.push({
          authorId: null,
        });
      }

      if (conditions.length === 0) {
        return stackIds;
      }

      const stacks = await prisma.stack.findMany({
        where: {
          id: { in: stackIds },
          dataSetId,
          AND: conditions,
        },
        select: { id: true },
      });

      return stacks.map((s) => s.id);
    },

    async filterByTags(stackIds: number[], filter: TagFilter): Promise<number[]> {
      let result = new Set(stackIds);

      // AND条件（すべてのタグを持つ）
      if (filter.include?.length) {
        for (const tagName of filter.include) {
          const tagged = await prisma.stack.findMany({
            where: {
              id: { in: Array.from(result) },
              dataSetId,
              tags: {
                some: {
                  tag: {
                    title: tagName,
                    dataSetId,
                  },
                },
              },
            },
            select: { id: true },
          });
          result = new Set(tagged.map((s) => s.id));
        }
      }

      // OR条件（いずれかのタグを持つ）
      if (filter.includeAny?.length) {
        const tagged = await prisma.stack.findMany({
          where: {
            id: { in: Array.from(result) },
            dataSetId,
            tags: {
              some: {
                tag: {
                  title: { in: filter.includeAny },
                  dataSetId,
                },
              },
            },
          },
          select: { id: true },
        });
        result = new Set(tagged.map((s) => s.id));
      }

      // NOT条件（指定タグを持たない）
      if (filter.exclude?.length) {
        const excluded = await prisma.stack.findMany({
          where: {
            id: { in: Array.from(result) },
            dataSetId,
            tags: {
              some: {
                tag: {
                  title: { in: filter.exclude },
                  dataSetId,
                },
              },
            },
          },
          select: { id: true },
        });
        const excludedSet = new Set(excluded.map((s) => s.id));
        result = new Set(Array.from(result).filter((id) => !excludedSet.has(id)));
      }

      // Not Set条件（タグなし）
      if (filter.includeNotSet) {
        const noTags = await prisma.stack.findMany({
          where: {
            id: { in: stackIds },
            dataSetId,
            tags: { none: {} },
          },
          select: { id: true },
        });
        result = new Set([...result, ...noTags.map((s) => s.id)]);
      }

      return Array.from(result);
    },

    async filterByFavorites(stackIds: number[], filter: 'is-fav' | 'not-fav'): Promise<number[]> {
      const userId = await ensureSuperUser(prisma);
      const favorites = await prisma.stackFavorite.findMany({
        where: {
          userId,
          stackId: { in: stackIds },
        },
        select: { stackId: true },
      });
      const favoriteIds = new Set(favorites.map((f) => f.stackId));
      if (filter === 'is-fav') {
        return Array.from(favoriteIds);
      }
      return stackIds.filter((id) => !favoriteIds.has(id));
    },

    async filterByLikes(stackIds: number[], filter: 'is-liked' | 'not-liked'): Promise<number[]> {
      const stacks = await prisma.stack.findMany({
        where: {
          id: { in: stackIds },
          dataSetId,
          liked: filter === 'is-liked' ? { gt: 0 } : 0,
        },
        select: { id: true },
      });
      return stacks.map((s) => s.id);
    },

    async filterByColor(stackIds: number[], filter: ColorFilter): Promise<number[]> {
      // 新方式（color-search-serviceオプション）のサポート
      const hasNewOptions =
        (filter as any).hueCategories || (filter as any).tonePoint || (filter as any).customColor;

      if (hasNewOptions) {
        try {
          const options: any = {
            hueCategories: (filter as any).hueCategories,
            tonePoint: (filter as any).tonePoint,
            toneTolerance: (filter as any).toneTolerance,
            customColor: (filter as any).customColor,
            similarityThreshold: (filter as any).similarityThreshold,
          };
          // まず色一致IDを取得
          const colorIds = await colorSearch.getColorMatchingStackIds(options);
          if (!colorIds || colorIds.length === 0) return [];
          const allow = new Set(colorIds);
          return stackIds.filter((id) => allow.has(id));
        } catch (e) {
          console.warn('Color filter (new options) failed, fallback to legacy:', e);
        }
      }

      if (filter.hue !== undefined || filter.hex) {
        // 色相またはHEXによる類似色検索
        const hue = filter.hue ?? (filter.hex ? this.hexToHue(filter.hex) : undefined);
        if (hue !== undefined) {
          // 色相によるフィルタリング
          const colorFiltered = await prisma.stack.findMany({
            where: {
              id: { in: stackIds },
              dataSetId,
              colors: {
                some: {
                  hue: {
                    gte: hue - 30,
                    lte: hue + 30,
                  },
                },
              },
            },
            select: { id: true },
          });
          return colorFiltered.map((s) => s.id);
        }
      }

      if (filter.tones) {
        // トーンによる検索
        const conditions: any = {};
        if (filter.tones.brightness) {
          // brightness は StackColor の lightness に相当
          conditions.lightness = {
            gte: filter.tones.brightness.min,
            lte: filter.tones.brightness.max,
          };
        }
        if (filter.tones.saturation) {
          conditions.saturation = {
            gte: filter.tones.saturation.min,
            lte: filter.tones.saturation.max,
          };
        }

        const toneFiltered = await prisma.stack.findMany({
          where: {
            id: { in: stackIds },
            dataSetId,
            colors: {
              some: conditions,
            },
          },
          select: { id: true },
        });
        return toneFiltered.map((s) => s.id);
      }

      return stackIds;
    },

    async filterByMediaType(
      stackIds: number[],
      mediaType: 'image' | 'comic' | 'video'
    ): Promise<number[]> {
      // Use the canonical mediaType field, not legacy category
      const stacks = await prisma.stack.findMany({
        where: {
          id: { in: stackIds },
          dataSetId,
          mediaType: mediaType,
        },
        select: { id: true },
      });
      return stacks.map((s) => s.id);
    },

    async filterByCollection(stackIds: number[], collectionId: number): Promise<number[]> {
      const stacks = await prisma.collectionStack.findMany({
        where: {
          stackId: { in: stackIds },
          collectionId,
        },
        select: { stackId: true },
      });
      return stacks.map((s) => s.stackId);
    },

    async sortStacks(
      stackIds: number[],
      sort: SortOptions,
      scores?: Map<number, number>
    ): Promise<number[]> {
      // 推奨ソート（スコアベース）
      if (sort.by === 'recommended' && scores) {
        return stackIds.sort((a, b) => {
          const scoreA = scores.get(a) || 0;
          const scoreB = scores.get(b) || 0;
          return sort.order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
        });
      }

      // その他のソート
      const orderBy: any = {};
      switch (sort.by) {
        case 'dateAdded':
          orderBy.createdAt = sort.order;
          break;
        case 'name':
          orderBy.name = sort.order;
          break;
        case 'likes':
          orderBy.likes = sort.order;
          break;
        case 'updated':
          orderBy.updatedAt = sort.order;
          break;
        default:
          orderBy.createdAt = 'desc';
      }

      const sorted = await prisma.stack.findMany({
        where: {
          id: { in: stackIds },
          dataSetId,
        },
        select: { id: true },
        orderBy,
      });

      return sorted.map((s) => s.id);
    },

    async getStacksByIds(stackIds: number[]): Promise<Stack[]> {
      if (stackIds.length === 0) {
        return [];
      }

      // 順序を保持するためにIDでマップを作成
      const stacks = await prisma.stack.findMany({
        where: {
          id: { in: stackIds },
          dataSetId,
        },
      });

      const stackMap = new Map(stacks.map((s) => [s.id, s]));
      return stackIds.map((id) => stackMap.get(id)).filter(Boolean) as Stack[];
    },

    hexToHue(hex: string): number {
      // HEXをHueに変換（簡易実装）
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;

      if (diff === 0) return 0;

      let hue = 0;
      if (max === r) {
        hue = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        hue = ((b - r) / diff + 2) / 6;
      } else {
        hue = ((r - g) / diff + 4) / 6;
      }

      return Math.round(hue * 360);
    },
  };
};
