import type { QueryClient } from '@tanstack/react-query';
import type { MediaGridItem } from '@/types';

// useRangeBasedQuery が使うページキャッシュの形。['stacks','page',datasetId,category,filterKey,sortKey,pageIndex] に対応する。
interface PageData {
  stacks: MediaGridItem[];
  total: number;
  offset: number;
  limit: number;
}

interface PageCacheEntry {
  key: readonly unknown[];
  pageIndex: number;
  data: PageData;
}

function isPageData(data: unknown): data is PageData {
  return !!data && typeof data === 'object' && Array.isArray((data as PageData).stacks);
}

function replaceStackAt(stacks: MediaGridItem[], index: number, patch: Partial<MediaGridItem>) {
  const updated = { ...stacks[index], ...patch };
  return [...stacks.slice(0, index), updated, ...stacks.slice(index + 1)];
}

/**
 * 読み込み済みの stacks ページキャッシュを走査し、id が一致する要素をイミュータブルに差し替える。
 * ビューワでのふぁぼ・いいね操作をリストへ即時反映するために使う。
 */
export function patchStackInPageCaches(
  queryClient: QueryClient,
  stackId: string | number,
  patch: Partial<MediaGridItem>
): void {
  const pages = queryClient.getQueriesData<PageData>({ queryKey: ['stacks', 'page'] });
  for (const [key, data] of pages) {
    if (!isPageData(data)) continue;
    const idx = data.stacks.findIndex((item) => String(item?.id) === String(stackId));
    if (idx < 0) continue;
    queryClient.setQueryData(key, { ...data, stacks: replaceStackAt(data.stacks, idx, patch) });
  }
}

/**
 * アセット単位のふぁぼ一覧(favoriteKind === 'asset')向けに、assetId が一致する要素をパッチする。
 */
export function patchAssetInPageCaches(
  queryClient: QueryClient,
  assetId: string | number,
  patch: Partial<MediaGridItem>
): void {
  const pages = queryClient.getQueriesData<PageData>({ queryKey: ['stacks', 'page'] });
  for (const [key, data] of pages) {
    if (!isPageData(data)) continue;
    const idx = data.stacks.findIndex(
      (item) => item?.favoriteKind === 'asset' && String(item?.assetId) === String(assetId)
    );
    if (idx < 0) continue;
    queryClient.setQueryData(key, { ...data, stacks: replaceStackAt(data.stacks, idx, patch) });
  }
}

/**
 * スタック削除を一覧キャッシュへ楽観的に反映する。
 * 対象を含むページから要素を除去し、後続の連続キャッシュページを前詰めする。
 * 前詰めの末端(または連続が途切れたページ)は1件不足したままになるため stale マークして再検証に委ねる。
 * データ形状が想定外の場合は何もしない防御的実装。
 */
export function removeStackFromPageCaches(
  queryClient: QueryClient,
  stackId: string | number
): void {
  const pages = queryClient.getQueriesData<PageData>({ queryKey: ['stacks', 'page'] });

  // list キー(datasetId/category/filterKey/sortKey)ごとにグループ化
  const groups = new Map<string, PageCacheEntry[]>();
  for (const [key, data] of pages) {
    if (!isPageData(data)) continue;
    const pageIndex = key[6];
    if (typeof pageIndex !== 'number') continue;
    const groupKey = JSON.stringify(key.slice(2, 6));
    const list = groups.get(groupKey) ?? [];
    list.push({ key, pageIndex, data });
    groups.set(groupKey, list);
  }

  for (const [groupKey, entries] of groups) {
    try {
      entries.sort((a, b) => a.pageIndex - b.pageIndex);

      const targetEntry = entries.find((entry) =>
        entry.data.stacks.some((item) => String(item?.id) === String(stackId))
      );
      if (!targetEntry) continue;

      const stacksByPage = new Map<number, MediaGridItem[]>();
      for (const entry of entries) {
        stacksByPage.set(entry.pageIndex, [...entry.data.stacks]);
      }

      const targetStacks = stacksByPage.get(targetEntry.pageIndex);
      if (!targetStacks) continue;
      const removeIdx = targetStacks.findIndex((item) => String(item?.id) === String(stackId));
      if (removeIdx < 0) continue;
      targetStacks.splice(removeIdx, 1);

      // 連続してキャッシュ済みの後続ページがある限り、次ページ先頭を前ページ末尾へ繰り上げて前詰めする
      let cursor = targetEntry.pageIndex;
      let shortPageIndex = targetEntry.pageIndex;
      while (true) {
        const nextIndex = cursor + 1;
        const nextStacks = stacksByPage.get(nextIndex);
        if (!nextStacks || nextStacks.length === 0) {
          shortPageIndex = cursor;
          break;
        }
        const moved = nextStacks.shift();
        if (moved === undefined) {
          shortPageIndex = cursor;
          break;
        }
        stacksByPage.get(cursor)?.push(moved);
        cursor = nextIndex;
        shortPageIndex = nextIndex;
      }

      for (const entry of entries) {
        const newStacks = stacksByPage.get(entry.pageIndex);
        if (!newStacks) continue;
        const newTotal = Math.max(0, entry.data.total - 1);
        queryClient.setQueryData(entry.key, { ...entry.data, stacks: newStacks, total: newTotal });
        if (entry.pageIndex === shortPageIndex) {
          // 1件不足したままのページは refetch せず stale マークのみ行い、次のマウント/読み込みで補完する
          queryClient.invalidateQueries({
            queryKey: entry.key as unknown[],
            refetchType: 'none',
          });
        }
      }

      const listKeyPrefix = JSON.parse(groupKey) as unknown[];
      const countKey = ['stacks', 'count', ...listKeyPrefix];
      const countData = queryClient.getQueryData<{ total: number }>(countKey);
      if (countData && typeof countData.total === 'number') {
        queryClient.setQueryData(countKey, {
          ...countData,
          total: Math.max(0, countData.total - 1),
        });
      }
    } catch (error) {
      // キャッシュ形状が想定外でもグリッド表示を壊さないよう、このグループはスキップする
      console.error('Failed to patch stack page caches after removal:', error);
    }
  }
}
