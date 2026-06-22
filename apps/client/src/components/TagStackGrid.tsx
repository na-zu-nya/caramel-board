import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { StackTileGrid } from '@/components/StackTileGrid';
import { downloadStackOriginals } from '@/lib/download-originals';
import { applyScrollbarCompensation, removeScrollbarCompensation } from '@/lib/scrollbar-utils';
import type { MediaGridItem } from '@/types';

interface TagStackGridProps {
  items: MediaGridItem[];
  datasetId?: string | number;
  isLoading?: boolean;
  hasMore?: boolean;
  className?: string;
  gridClassName?: string;
  cornerRadius?: 'rounded' | 'none';
  isSelectionMode?: boolean;
  selectedItems?: ReadonlySet<string | number>;
  selectedActionCount?: number;
  onEnterSelectionMode?: (itemId: string | number) => void;
  onToggleSelection?: (itemId: string | number) => void;
  onSelectRange?: (itemIds: Array<string | number>) => void;
  onBulkEditSelected?: () => void;
  onDownloadSelected?: () => void;
  onRemoveSelectedStacks?: () => void;
  onOpenItem?: (item: MediaGridItem) => void | Promise<void>;
  onDownloadItem?: (item: MediaGridItem) => void;
}

export default function TagStackGrid({
  items,
  datasetId,
  isLoading = false,
  hasMore = false,
  className,
  gridClassName = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4',
  cornerRadius = 'rounded',
  isSelectionMode = false,
  selectedItems,
  selectedActionCount = 0,
  onEnterSelectionMode,
  onToggleSelection,
  onSelectRange,
  onBulkEditSelected,
  onDownloadSelected,
  onRemoveSelectedStacks,
  onOpenItem,
  onDownloadItem,
}: TagStackGridProps) {
  const navigate = useNavigate();
  // While this grid is mounted, stabilize body scrollbar gutter for contextmenu reflows
  useEffect(() => {
    applyScrollbarCompensation();
    return () => {
      removeScrollbarCompensation();
    };
  }, []);

  const getDatasetId = useCallback((item: MediaGridItem) => {
    const value = item.dataSetId ?? item.datasetId;
    if (typeof value === 'number' || typeof value === 'string') {
      return String(value);
    }
    return '';
  }, []);
  const resolvedDatasetId = datasetId ?? (items[0] ? getDatasetId(items[0]) : undefined);

  const handleOpen = useCallback(
    async (item: MediaGridItem) => {
      const datasetId = getDatasetId(item);
      if (!datasetId) return;

      await navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(item.id) },
      });
    },
    [getDatasetId, navigate]
  );

  const handleOpenItem = useCallback(
    async (item: MediaGridItem) => {
      if (onOpenItem) {
        await onOpenItem(item);
        return;
      }
      await handleOpen(item);
    },
    [handleOpen, onOpenItem]
  );

  const handleDownload = useCallback(
    (item: MediaGridItem) => {
      if (onDownloadItem) {
        onDownloadItem(item);
        return;
      }
      const datasetId = getDatasetId(item);
      if (!datasetId) return;
      downloadStackOriginals(datasetId, [item.id]);
    },
    [getDatasetId, onDownloadItem]
  );

  const getLinkElement = useCallback(
    (item: MediaGridItem) => (
      <Link
        to="/library/$datasetId/stacks/$stackId"
        params={(): { datasetId: string; stackId: string } => ({
          datasetId: getDatasetId(item),
          stackId: String(item.id),
        })}
      />
    ),
    [getDatasetId]
  );

  return (
    <StackTileGrid
      items={items}
      datasetId={resolvedDatasetId}
      className={className}
      gridClassName={gridClassName}
      cornerRadius={cornerRadius}
      isLoading={isLoading}
      hasMore={hasMore}
      isSelectionMode={isSelectionMode}
      selectedItems={selectedItems}
      selectedActionCount={selectedActionCount}
      getLinkElement={getLinkElement}
      onEnterSelectionMode={onEnterSelectionMode}
      onToggleSelection={onToggleSelection}
      onSelectRange={onSelectRange}
      onOpenItem={handleOpenItem}
      onDownloadItem={handleDownload}
      onDownloadSelected={onDownloadSelected}
      onBulkEditSelected={onBulkEditSelected}
      onRemoveSelectedStacks={onRemoveSelectedStacks}
    />
  );
}
