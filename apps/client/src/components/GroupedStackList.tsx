import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { Heart } from 'lucide-react';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { MonthSectionHeader } from '@/components/ui/MonthSectionHeader';
import { StackTile } from '@/components/ui/Stack';
import { useStackTile } from '@/hooks/useStackTile';
import { applyScrollbarCompensation, removeScrollbarCompensation } from '@/lib/scrollbar-utils';
import { getSourceImageFilename, getSourceImageUrl } from '@/lib/stack-drag-data';
import type { Stack } from '@/types';

export interface GroupedStack {
  id: string | number;
  assetId?: string | number | null;
  likePage?: number;
  createdAt: string;
  stack: Stack;
}

interface GroupedStackListProps {
  items: GroupedStack[];
  datasetId: string;
  groupByMonth?: boolean;
  groupByDate?: boolean;
  itemWidth?: string;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function GroupedStackList({
  items,
  datasetId,
  groupByMonth = true,
  groupByDate = true,
  itemWidth = 'w-40',
  onLoadMore,
  isLoading,
}: GroupedStackListProps) {
  // While this list is mounted, stabilize body scrollbar gutter for contextmenu reflows
  useEffect(() => {
    applyScrollbarCompensation();
    return () => {
      removeScrollbarCompensation();
    };
  }, []);
  // Group items by month
  const groupedByMonth: Record<string, GroupedStack[]> = {};

  if (groupByMonth) {
    for (const item of items) {
      const monthKey = format(new Date(item.createdAt), 'yyyy-MM');
      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = [];
      }
      groupedByMonth[monthKey].push(item);
    }
  } else {
    // If not grouping by month, put all items in a single group
    groupedByMonth.all = items;
  }

  // Sort months in descending order
  const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => {
    if (a === 'all') return 0;
    return b.localeCompare(a);
  });

  // Group items by date within each month
  const getGroupedByDate = (items: GroupedStack[]) => {
    if (!groupByDate) {
      return { all: items };
    }

    const grouped: Record<string, GroupedStack[]> = {};
    for (const item of items) {
      const dateKey = format(new Date(item.createdAt), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(item);
    }
    return grouped;
  };

  const {
    onOpen,
    onFindSimilar,
    onAddToScratch,
    onDownload,
    onToggleFavorite,
    onLike,
    onInfo,
    onRemoveLike,
    onRemoveStack,
    dragProps,
  } = useStackTile(datasetId);

  return (
    <div className="w-full p-4 space-y-8 list-stable">
      {sortedMonths.map((monthKey) => {
        const monthItems = groupedByMonth[monthKey];
        if (!monthItems || monthItems.length === 0) return null;

        const showMonthHeader = groupByMonth && monthKey !== 'all';
        const monthDate = showMonthHeader ? new Date(`${monthKey}-01`) : null;
        const monthLabel = monthDate ? format(monthDate, 'MMMM', { locale: enUS }) : null;
        const monthLikeCount = monthItems.length;

        const itemsByDate = getGroupedByDate(monthItems);
        const sortedDates = Object.keys(itemsByDate).sort((a, b) => {
          if (a === 'all') return 0;
          return b.localeCompare(a);
        });

        return (
          <div key={monthKey} className="space-y-4">
            {showMonthHeader && monthLabel && (
              <MonthSectionHeader month={monthLabel} likeCount={monthLikeCount} />
            )}

            {/* Wrapped horizontal container for date groups */}
            <div className="flex flex-wrap gap-6">
              {sortedDates.map((dateKey) => {
                const dateItems = itemsByDate[dateKey];
                const showDateBadge = groupByDate && dateKey !== 'all';
                const dateLabel = showDateBadge
                  ? format(new Date(dateKey), 'M月d日', { locale: ja })
                  : null;

                return (
                  <div key={dateKey} className="space-y-3">
                    {/* Date badge */}
                    {showDateBadge && dateLabel && (
                      <Badge variant="default" className="mb-2">
                        {dateLabel}
                      </Badge>
                    )}

                    {/* Horizontal list of items for this date */}
                    <div className="flex gap-2">
                      {dateItems.map((item) => {
                        const stack = item.stack;
                        const thumb = stack.thumbnail || stack.thumbnailUrl || '/no-image.png';
                        const sourceImageUrl = getSourceImageUrl(stack, thumb);
                        const sourceImageFilename = sourceImageUrl
                          ? getSourceImageFilename(stack, sourceImageUrl, `stack-${stack.id}`)
                          : undefined;
                        const likeCount = Number(stack.likeCount ?? stack.liked ?? 0);
                        const pageCount = stack.assetCount || stack.assetsCount || 0;
                        const isFav = stack.favorited || stack.isFavorite || false;
                        const likeActivityId = item.id;
                        const likePage = item.likePage;
                        const isAssetLike = item.assetId != null && typeof likePage === 'number';
                        const stackOpenOptions = {
                          ...(isAssetLike ? { page: likePage - 1 } : {}),
                          mediaType: stack.mediaType,
                        };
                        return (
                          <div key={item.id} className={`${itemWidth} relative`}>
                            <StackTile
                              thumbnailUrl={thumb}
                              nativeImageDragUrl={sourceImageUrl}
                              pageCount={pageCount}
                              favorited={isFav}
                              likeCount={likeCount}
                              onOpen={() => onOpen(stack.id, stackOpenOptions)}
                              onInfo={() => onInfo(stack.id)}
                              onFindSimilar={() => onFindSimilar(stack.id)}
                              onAddToScratch={() => onAddToScratch(stack.id)}
                              onDownload={() => onDownload(stack.id)}
                              onToggleFavorite={() => onToggleFavorite(stack.id, isFav)}
                              onLike={() => onLike(stack.id)}
                              onRemoveLike={
                                onRemoveLike
                                  ? () =>
                                      onRemoveLike({
                                        activityId: likeActivityId,
                                        stackId: stack.id,
                                      })
                                  : undefined
                              }
                              onRemoveStack={() => onRemoveStack(stack.id, stack.name)}
                              dragHandlers={dragProps(
                                stack.id,
                                sourceImageUrl,
                                sourceImageFilename
                              )}
                              asChild
                            >
                              <Link
                                to="/library/$datasetId/stacks/$stackId"
                                params={{ datasetId, stackId: String(stack.id) }}
                                search={stackOpenOptions}
                              />
                            </StackTile>
                            {isAssetLike && (
                              <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full bg-rose-500/90 px-2 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur">
                                <Heart size={11} className="fill-current" />
                                p.{likePage}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Load more trigger */}
      {onLoadMore && (
        <div className="flex justify-center py-4">
          {isLoading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <button
              type="button"
              onClick={onLoadMore}
              className="text-blue-500 hover:text-blue-400 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
