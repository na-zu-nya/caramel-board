import type { AriaRole, ReactElement } from 'react';
import { useCallback } from 'react';
import { StackTile } from '@/components/ui/Stack';
import { useStackSelectionClick } from '@/hooks/features/useStackSelectionClick';
import { useStackCollectionMenu } from '@/hooks/useStackCollectionMenu';
import { useT } from '@/lib/i18n';
import { getSourceImageFilename, getSourceImageUrl } from '@/lib/stack-drag-data';
import { cn } from '@/lib/utils';

type StackTileGridItemId = string | number;

interface StackTileGridItemBase {
  id: StackTileGridItemId;
  name?: unknown;
  title?: unknown;
  thumbnail?: unknown;
  thumbnailUrl?: unknown;
  assetCount?: unknown;
  assetsCount?: unknown;
  likeCount?: unknown;
  liked?: unknown;
  favorited?: unknown;
  isFavorite?: unknown;
  mediaType?: string | null;
  originalName?: unknown;
  file?: unknown;
  url?: unknown;
  preview?: unknown;
  assets?: unknown;
  _count?: {
    assets?: unknown;
  } | null;
}

interface StackTileDragHandlers {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

interface StackTileGridProps<TItem extends StackTileGridItemBase> {
  items: TItem[];
  datasetId?: string | number;
  className?: string;
  gridClassName?: string;
  role?: AriaRole;
  ariaLabel?: string;
  cornerRadius?: 'rounded' | 'none';
  isLoading?: boolean;
  hasMore?: boolean;
  isSelectionMode?: boolean;
  selectedItems?: ReadonlySet<StackTileGridItemId>;
  selectedInfoItemId?: StackTileGridItemId | null;
  selectedActionCount?: number;
  getLinkElement?: (item: TItem) => ReactElement;
  onClickItem?: (item: TItem, event: React.MouseEvent<HTMLDivElement>) => void;
  onEnterSelectionMode?: (itemId: StackTileGridItemId, item: TItem) => void;
  onBeforeEnterSelectionMode?: () => void;
  onToggleSelection?: (itemId: StackTileGridItemId, item: TItem) => void;
  onSelectRange?: (itemIds: StackTileGridItemId[], items: TItem[]) => void;
  onOpenItem?: (item: TItem) => void;
  onInfoItem?: (item: TItem) => void;
  onFindSimilarItem?: (item: TItem) => void;
  onAddToScratchItem?: (item: TItem) => void;
  onDownloadItem?: (item: TItem) => void;
  onDownloadSelected?: () => void;
  onBulkEditSelected?: () => void;
  onMergeSelected?: () => void;
  onRemoveSelectedStacks?: () => void;
  onToggleFavoriteItem?: (item: TItem, favorited: boolean) => void;
  onLikeItem?: (item: TItem) => void;
  getDragHandlers?: (
    item: TItem,
    sourceImageUrl: string | null,
    sourceImageFilename: string | undefined
  ) => StackTileDragHandlers | undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function getThumbnail(item: StackTileGridItemBase): string | null {
  return getString(item.thumbnail) ?? getString(item.thumbnailUrl) ?? '/no-image.png';
}

function getPageCount(item: StackTileGridItemBase): number {
  return (
    getNumber(item.assetCount) ??
    getNumber(item._count?.assets) ??
    getNumber(item.assetsCount) ??
    getArrayLength(item.assets) ??
    0
  );
}

function getLikeCount(item: StackTileGridItemBase): number {
  return getNumber(item.likeCount) ?? getNumber(item.liked) ?? 0;
}

function getFavorited(item: StackTileGridItemBase): boolean {
  return Boolean(item.favorited ?? item.isFavorite);
}

export function StackTileGrid<TItem extends StackTileGridItemBase>({
  items,
  datasetId,
  className,
  gridClassName,
  role,
  ariaLabel,
  cornerRadius = 'rounded',
  isLoading = false,
  hasMore = false,
  isSelectionMode = false,
  selectedItems,
  selectedInfoItemId,
  selectedActionCount,
  getLinkElement,
  onClickItem,
  onEnterSelectionMode,
  onBeforeEnterSelectionMode,
  onToggleSelection,
  onSelectRange,
  onOpenItem,
  onInfoItem,
  onFindSimilarItem,
  onAddToScratchItem,
  onDownloadItem,
  onDownloadSelected,
  onBulkEditSelected,
  onMergeSelected,
  onRemoveSelectedStacks,
  onToggleFavoriteItem,
  onLikeItem,
  getDragHandlers,
}: StackTileGridProps<TItem>) {
  const t = useT();
  const hasCollectionMenu = datasetId !== undefined && datasetId !== null;
  const {
    collections,
    isLoadingCollections,
    addStackIdsToCollection,
    openCreateCollectionForStackIds,
    createCollectionModal,
  } = useStackCollectionMenu(datasetId ?? '');
  const resolvedSelectedActionCount = selectedActionCount ?? selectedItems?.size ?? 0;
  const { handleClick } = useStackSelectionClick({
    items,
    isSelectionMode,
    onBeforeEnterSelectionMode,
    onEnterSelectionMode,
    onToggleSelection,
    onSelectRange,
    onClick: onClickItem,
  });

  const renderTile = useCallback(
    (item: TItem) => {
      const thumbnail = getThumbnail(item);
      const sourceImageUrl = getSourceImageUrl(item, thumbnail);
      const sourceImageFilename = sourceImageUrl
        ? getSourceImageFilename(item, sourceImageUrl, `stack-${item.id}`)
        : undefined;
      const favorited = getFavorited(item);
      const linkElement = getLinkElement?.(item);
      const title = getString(item.name) ?? getString(item.title);
      const isSelected = selectedItems?.has(item.id) ?? false;
      const contextStackIds =
        isSelectionMode && isSelected && selectedItems && selectedItems.size > 0
          ? Array.from(selectedItems)
          : [item.id];
      const collectionMenu = hasCollectionMenu
        ? {
            collections,
            isLoading: isLoadingCollections,
            onCreateCollection: () => openCreateCollectionForStackIds(contextStackIds),
            onAddToCollection: (collectionId: number) =>
              addStackIdsToCollection(collectionId, contextStackIds),
          }
        : undefined;

      return (
        <StackTile
          key={item.id}
          asChild={Boolean(linkElement)}
          cornerRadius={cornerRadius}
          thumbnailUrl={thumbnail}
          nativeImageDragUrl={sourceImageUrl}
          title={title}
          pageCount={getPageCount(item)}
          favorited={favorited}
          likeCount={getLikeCount(item)}
          isSelectionMode={isSelectionMode}
          isSelected={isSelected}
          isInfoSelected={
            selectedInfoItemId !== null &&
            selectedInfoItemId !== undefined &&
            String(selectedInfoItemId) === String(item.id)
          }
          selectedActionCount={resolvedSelectedActionCount}
          onClick={(event) => handleClick(item, event)}
          onToggleSelection={() => onToggleSelection?.(item.id, item)}
          onOpen={onOpenItem ? () => onOpenItem(item) : undefined}
          onInfo={onInfoItem ? () => onInfoItem(item) : undefined}
          onFindSimilar={onFindSimilarItem ? () => onFindSimilarItem(item) : undefined}
          onAddToScratch={onAddToScratchItem ? () => onAddToScratchItem(item) : undefined}
          collectionMenu={collectionMenu}
          onDownload={onDownloadItem ? () => onDownloadItem(item) : undefined}
          onDownloadSelected={onDownloadSelected}
          onBulkEditSelected={onBulkEditSelected}
          onMergeSelected={onMergeSelected}
          onRemoveSelectedStacks={onRemoveSelectedStacks}
          onToggleFavorite={
            onToggleFavoriteItem ? () => onToggleFavoriteItem(item, favorited) : undefined
          }
          onLike={onLikeItem ? () => onLikeItem(item) : undefined}
          dragHandlers={getDragHandlers?.(item, sourceImageUrl, sourceImageFilename)}
        >
          {linkElement}
        </StackTile>
      );
    },
    [
      cornerRadius,
      addStackIdsToCollection,
      collections,
      getDragHandlers,
      getLinkElement,
      handleClick,
      hasCollectionMenu,
      isLoadingCollections,
      isSelectionMode,
      onAddToScratchItem,
      onBulkEditSelected,
      onDownloadItem,
      onDownloadSelected,
      onFindSimilarItem,
      onInfoItem,
      onLikeItem,
      onMergeSelected,
      onOpenItem,
      onRemoveSelectedStacks,
      onToggleFavoriteItem,
      onToggleSelection,
      openCreateCollectionForStackIds,
      resolvedSelectedActionCount,
      selectedInfoItemId,
      selectedItems,
    ]
  );

  if (items.length === 0) {
    return <div className="text-center py-16 text-muted-foreground">{t.grid.noStacksFound}</div>;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div
        role={role}
        aria-label={ariaLabel}
        className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4', gridClassName)}
      >
        {items.map(renderTile)}
      </div>
      {createCollectionModal}

      {isLoading ? (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {t.grid.loadingMore}
          </div>
        </div>
      ) : null}

      {!isLoading && hasMore ? (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {t.common.scrollToLoadMore}
        </div>
      ) : null}
    </div>
  );
}
