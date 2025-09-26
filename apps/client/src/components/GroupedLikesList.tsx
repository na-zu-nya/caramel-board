import type { Stack } from '@/types';
import { type GroupedStack, GroupedStackList } from './GroupedStackList';

interface GroupedLikesListProps {
  groupedByMonth: Record<
    string,
    Array<{
      id: string;
      stackId: string;
      createdAt: string;
      stack: Stack;
    }>
  >;
  datasetId: string;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function GroupedLikesList({
  groupedByMonth,
  datasetId,
  onLoadMore,
  isLoading,
}: GroupedLikesListProps) {
  // Convert to flat array for GroupedStackList
  const allItems: GroupedStack[] = [];

  for (const [_monthKey, items] of Object.entries(groupedByMonth)) {
    for (const item of items) {
      allItems.push({
        id: item.id,
        createdAt: item.createdAt,
        stack: item.stack,
      });
    }
  }

  // Sort by createdAt descending
  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <GroupedStackList
      items={allItems}
      datasetId={datasetId}
      groupByMonth={true}
      groupByDate={true}
      itemWidth="w-40"
      onLoadMore={onLoadMore}
      isLoading={isLoading}
    />
  );
}
