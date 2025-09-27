import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { navigationStateAtom } from '@/stores/navigation';
import type { MediaGridItem, StackFilter } from '@/types';

interface UseSparseStackGridOptions {
  datasetId: string;
  mediaType?: string;
  filter: StackFilter;
  sort: any;
  pageSize?: number;
}

export function useSparseStackGrid({
  datasetId,
  mediaType,
  filter,
  sort,
  pageSize = 50,
}: UseSparseStackGridOptions) {
  const location = useLocation();
  const currentPath = location.pathname;
  const [navigationState, setNavigationState] = useAtom(navigationStateAtom);
  const scrollRestoredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sparseな配列でアイテムを管理
  const [items, setItems] = useState<(MediaGridItem | undefined)[]>([]);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());

  // 現在のクエリキーを生成
  const queryKey = `${datasetId}-${mediaType}-${JSON.stringify(filter)}-${JSON.stringify(sort)}`;

  // トータル数を取得
  const { data: countData } = useQuery({
    queryKey: ['stacks', 'count', datasetId, mediaType, filter, sort],
    queryFn: async () => {
      const result = await apiClient.getStacks({
        datasetId,
        filter,
        sort,
        limit: 1,
        offset: 0,
      });
      return { total: result.total };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const total = countData?.total || 0;

  // ナビゲーション状態から復元するかチェック
  const shouldRestore =
    navigationState && navigationState.lastPath.includes('/stacks/') && !scrollRestoredRef.current;

  // 初期化：トータル数が分かったら配列を作成
  useEffect(() => {
    if (total > 0) {
      if (shouldRestore && navigationState) {
        // 保存された状態から復元
        console.log('📌 Restoring navigation state');
        setItems(navigationState.items);
        setLoadedPages(new Set()); // ページ情報は再計算が必要

        // スクロール位置を復元
        if (containerRef.current && !scrollRestoredRef.current) {
          containerRef.current.scrollTop = navigationState.scrollPosition;
          scrollRestoredRef.current = true;
        }
      } else if (items.length !== total) {
        // 新規作成
        console.log('📌 Creating sparse array with total:', total);
        setItems(new Array(total).fill(undefined));
        setLoadedPages(new Set());
        scrollRestoredRef.current = false;
      }
    }
  }, [total, shouldRestore, navigationState]);

  // クエリキーが変わったらリセット
  useEffect(() => {
    setItems([]);
    setLoadedPages(new Set());
    scrollRestoredRef.current = false;
  }, [queryKey]);

  // ページをロード
  const loadPage = useCallback(
    async (pageIndex: number) => {
      if (loadedPages.has(pageIndex)) return;

      const offset = pageIndex * pageSize;
      if (offset >= total) return;

      try {
        const result = await apiClient.getStacks({
          datasetId,
          filter,
          sort,
          limit: pageSize,
          offset,
        });

        // Sparse配列に結果を配置
        setItems((prev) => {
          const newItems = [...prev];
          result.stacks.forEach((item, index) => {
            const targetIndex = offset + index;
            if (targetIndex < newItems.length) {
              newItems[targetIndex] = item;
            }
          });
          return newItems;
        });

        setLoadedPages((prev) => new Set([...prev, pageIndex]));
      } catch (error) {
        console.error('Failed to load page:', pageIndex, error);
      }
    },
    [datasetId, filter, sort, pageSize, total, loadedPages]
  );

  // 範囲をロード
  const loadRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      const startPage = Math.floor(startIndex / pageSize);
      const endPage = Math.floor(endIndex / pageSize);

      // ロードが必要なページを特定
      const pagesToLoad = [];
      for (let i = startPage; i <= endPage; i++) {
        if (!loadedPages.has(i)) {
          pagesToLoad.push(i);
        }
      }

      // 並列でロード（最大2ページ）
      const promises = pagesToLoad.slice(0, 2).map((pageIndex) => loadPage(pageIndex));
      await Promise.all(promises);
    },
    [pageSize, loadedPages, loadPage]
  );

  // スクロール位置を保存
  const saveScrollPosition = useCallback(() => {
    if (containerRef.current) {
      setNavigationState({
        scrollPosition: containerRef.current.scrollTop,
        total,
        items,
        lastPath: currentPath,
      });
    }
  }, [setNavigationState, total, items, currentPath]);

  // スクロールハンドラー
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const itemSize = 200; // 仮の値、実際は計算が必要
    const itemsPerRow = 5; // 仮の値

    // 表示範囲を計算
    const startRow = Math.floor(scrollTop / itemSize);
    const endRow = Math.ceil((scrollTop + clientHeight) / itemSize);

    // バッファを追加
    const bufferRows = 3;
    const startIndex = Math.max(0, (startRow - bufferRows) * itemsPerRow);
    const endIndex = Math.min(total - 1, (endRow + bufferRows) * itemsPerRow);

    // 必要な範囲をロード
    void loadRange(startIndex, endIndex);
  }, [total, loadRange]);

  return {
    items,
    total,
    containerRef,
    handleScroll,
    saveScrollPosition,
    isLoading: !countData,
  };
}
