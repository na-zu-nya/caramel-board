import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GroupedLikesList } from '@/components/GroupedLikesList';
import InfoSidebar from '@/components/InfoSidebar';
import { YearPagination } from '@/components/YearPagination';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom } from '@/stores/ui';

export const Route = createFileRoute('/library/$datasetId/likes')({
  component: LikesPage,
});

function LikesPage() {
  const { datasetId } = Route.useParams();
  const [, setCurrentFilter] = useAtom(currentFilterAtom);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [accumulatedData, setAccumulatedData] = useState<Record<string, any[]>>({});

  // Enable header actions (library routes)
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: false,
      showFilter: false,
      showSelection: false,
    }),
    []
  );

  useHeaderActions(headerActionsConfig);
  // Reset global filter when entering Likes top page
  useEffect(() => {
    setCurrentFilter({ datasetId });
  }, [datasetId, setCurrentFilter]);
  const [navigationState, setNavigationState] = useAtom(navigationStateAtom);
  const restoreScrollSafely = useCallback((targetY: number, retries = 40, delay = 50) => {
    let cancelled = false;
    const step = (n: number) => {
      if (cancelled) return;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll >= Math.max(0, targetY - 10)) {
        window.scrollTo(0, targetY);
        return;
      }
      if (n <= 0) return;
      setTimeout(() => requestAnimationFrame(() => step(n - 1)), delay);
    };
    step(retries);
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch yearly likes data (search removed)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['likes', 'yearly', datasetId, currentYear],
    queryFn: () =>
      apiClient.getYearlyLikes({
        year: currentYear,
        datasetId,
        // search removed
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Reset accumulated data when year changes
  useEffect(() => {
    setAccumulatedData({});
  }, []);

  // Merge new data with accumulated data
  useEffect(() => {
    if (data?.groupedByMonth) {
      setAccumulatedData((prev) => {
        const merged = { ...prev };
        for (const [month, items] of Object.entries(data.groupedByMonth)) {
          if (!merged[month]) {
            merged[month] = [];
          }
          // Add new items that don't already exist
          const existingIds = new Set(merged[month].map((item) => item.id));
          const newItems = items.filter((item) => !existingIds.has(item.id));
          merged[month] = [...merged[month], ...newItems];
        }
        return merged;
      });
    }
  }, [data]);

  // Handle year change
  const handleYearChange = useCallback((year: number) => {
    setCurrentYear(year);
  }, []);

  // Handle incremental loading
  const handleLoadMore = useCallback(() => {
    // Check if we need incremental loading (more than 500 items)
    if (data && data.totalItems > 500 && Object.keys(accumulatedData).length > 0) {
      // Get the oldest loaded item to determine next batch
      const allItems = Object.values(accumulatedData).flat();
      if (allItems.length < data.totalItems) {
        // In a real implementation, we'd load the next batch here
        // For now, we'll just refetch to simulate loading more
        refetch();
      }
    }
  }, [data, accumulatedData, refetch]);

  // Calculate if we need to show load more
  const needsLoadMore = useMemo(() => {
    if (!data) return false;
    const loadedCount = Object.values(accumulatedData).flat().length;
    return data.totalItems > 500 && loadedCount < data.totalItems;
  }, [data, accumulatedData]);

  // Restore when returning
  useEffect(() => {
    if (navigationState && navigationState.lastPath === window.location.pathname && data) {
      setTimeout(() => {
        restoreScrollSafely(navigationState.scrollPosition);
        setNavigationState(null);
      }, 0);
    }
  }, [navigationState, data, setNavigationState, restoreScrollSafely]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Search box removed per spec */}
      <YearPagination
        currentYear={currentYear}
        availableYears={data?.availableYears || [currentYear]}
        onYearChange={handleYearChange}
      />

      <div className="flex-1">
        {isLoading && Object.keys(accumulatedData).length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : Object.keys(accumulatedData).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-6xl mb-4">❤️</div>
            <h2 className="text-xl font-semibold mb-2">No liked items in {currentYear}</h2>
            <p className="text-gray-500">Like items to see them here.</p>
          </div>
        ) : (
          <GroupedLikesList
            groupedByMonth={accumulatedData}
            datasetId={datasetId}
            onLoadMore={needsLoadMore ? handleLoadMore : undefined}
            isLoading={isLoading}
          />
        )}
      </div>
      {/* Info Sidebar */}
      <InfoSidebar />
    </div>
  );
}
