import { type QueryClient, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getImageDisplaySource, isVideoAsset } from '@/lib/media';
import type { Asset, SortOption, Stack, StackFilter } from '@/types';

// Query keys
export const stackKeys = {
  all: ['stacks'] as const,
  lists: () => [...stackKeys.all, 'list'] as const,
  list: (filter: StackFilter, sort?: SortOption) => [...stackKeys.lists(), filter, sort] as const,
  details: () => [...stackKeys.all, 'detail'] as const,
  detail: (datasetId: string, stackId: string) =>
    [...stackKeys.details(), datasetId, stackId] as const,
};

// 先読み済み画像URLの記録（重複プリロード回避）
const preloadedImageUrls = new Set<string>();

// タッチダウン時の先読み: スタック詳細を取得し、続けて1枚目の画像をブラウザキャッシュへ。
// ビューワを開く頃に両方が温まっていれば、ヒーロー拡大中に即すり替えできる
export async function prefetchStackForViewer(
  queryClient: QueryClient,
  datasetId: string,
  stackId: string
) {
  try {
    await queryClient.prefetchQuery({
      queryKey: stackKeys.detail(datasetId, stackId),
      queryFn: () => apiClient.getStack(stackId, datasetId),
      staleTime: 10_000,
    });
    const stack = queryClient.getQueryData<Stack>(stackKeys.detail(datasetId, stackId));
    const assets = stack?.assets;
    if (!assets || assets.length === 0) return;

    // orderInStack 昇順で並べ、先頭アセットを対象にする（ImageCarousel の1ページ目と同じ）
    const firstAsset: Asset | undefined = [...assets].sort(
      (a, b) => (a.orderInStack ?? 0) - (b.orderInStack ?? 0)
    )[0];
    if (!firstAsset) return;

    // ImageCarousel の実際の表示ソース優先順に合わせる
    // （画像: getImageDisplaySource、動画: preview -> file -> url。ImageCarousel.tsx 363行目参照）
    const url = isVideoAsset(firstAsset)
      ? firstAsset.preview || firstAsset.file || firstAsset.url
      : getImageDisplaySource(firstAsset);

    if (url && !preloadedImageUrls.has(url)) {
      preloadedImageUrls.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  } catch {
    // 先読み失敗は本読み込みにフォールバックするだけなので握りつぶす
  }
}

// Hooks
export function useStacks(params: {
  datasetId: string | number;
  filter?: StackFilter;
  sort?: SortOption;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: stackKeys.list(params.filter || {}, params.sort),
    queryFn: () => apiClient.getStacks(params),
    enabled: params.enabled !== false,
  });
}

export function useStack(datasetId: string, stackId: string) {
  return useQuery({
    queryKey: stackKeys.detail(datasetId, stackId),
    queryFn: () => apiClient.getStack(stackId, datasetId),
    enabled: !!datasetId && !!stackId,
  });
}

// Hook for infinite scrolling with category filter
export function useStacksInfinite(params: {
  datasetId: string | number;
  filter?: StackFilter;
  sort?: SortOption;
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: stackKeys.list(params.filter || {}, params.sort),
    queryFn: () =>
      apiClient.getStacks({
        ...params,
        offset: 0,
      }),
    enabled: params.enabled !== false,
  });
}
