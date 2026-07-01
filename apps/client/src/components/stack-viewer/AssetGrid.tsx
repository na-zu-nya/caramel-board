import {
  Bookmark,
  Check,
  ChevronDown,
  Download,
  Heart,
  Plus,
  SplitSquareHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type SelectionAction, SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useT } from '@/lib/i18n';
import { isVideoAsset } from '@/lib/media';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types';
import {
  type AssetGridDropTarget,
  findAssetGridSourceIndex,
  getAssetGridCellIndexFromPoint,
  getAssetGridInsertionIndexForPlaceholder,
  getAssetGridPreviewIndex,
  isAssetGridInsertionNoop,
  reorderAssetsByInsertionIndex,
} from './asset-grid-reorder';
import type { AssetSortPreset } from './StackToolbar';

interface AssetGridProps {
  assets: Asset[];
  currentPage: number;
  onSelectPage: (page: number, asset: Asset) => void;
  onRemoveAsset?: (assetId: string | number) => void;
  onSeparateAsset?: (assetId: string | number) => void;
  selectedAssetIds?: ReadonlySet<Asset['id']>;
  isSelectionMode?: boolean;
  onEnterAssetSelectionMode?: (assetId: Asset['id']) => void;
  onToggleAssetSelection?: (assetId: Asset['id']) => void;
  onSelectAssetRange?: (assetId: Asset['id']) => void;
  onClearAssetSelection?: () => void;
  onDownloadAssets?: (assetIds: Array<Asset['id']>) => void;
  onRemoveAssets?: (assetIds: Array<Asset['id']>) => void;
  onSeparateAssets?: (assetIds: Array<Asset['id']>) => void;
  onCreateStackFromAssets?: (assetIds: Array<Asset['id']>) => void;
  onToggleAssetFavorite?: (assetId: Asset['id']) => void;
  onLikeAsset?: (assetId: Asset['id']) => void;
  onReorderAssets?: (assets: Asset[]) => void;
  className?: string;
  // Top action bar (list mode)
  onSortPresetSelect?: (preset: AssetSortPreset) => void;
  canSortAssets?: boolean;
}

const getAssetDisplayName = (asset: Asset) => {
  if (asset.originalName && asset.originalName.trim().length > 0) {
    return asset.originalName;
  }
  const rawPath = asset.file || asset.url || '';
  const normalizedPath = rawPath.split('?')[0];
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || '';
};

const getAssetLikeCount = (asset: Asset) => {
  const likeCount = asset.likeCount ?? asset.liked ?? 0;
  return Number.isFinite(likeCount) ? likeCount : 0;
};

export default function AssetGrid({
  assets,
  onSelectPage,
  onRemoveAsset,
  onSeparateAsset,
  selectedAssetIds,
  isSelectionMode = false,
  onEnterAssetSelectionMode,
  onToggleAssetSelection,
  onSelectAssetRange,
  onClearAssetSelection,
  onDownloadAssets,
  onRemoveAssets,
  onSeparateAssets,
  onCreateStackFromAssets,
  onToggleAssetFavorite,
  onLikeAsset,
  onReorderAssets,
  className,
  onSortPresetSelect,
  canSortAssets = false,
}: AssetGridProps) {
  const t = useT();
  const [draggedAssetId, setDraggedAssetId] = useState<Asset['id'] | null>(null);
  const [dropTarget, setDropTarget] = useState<AssetGridDropTarget | null>(null);
  const [isDropSettling, setIsDropSettling] = useState(false);
  const dropSettlingFrameRef = React.useRef<number | null>(null);
  const selectedAssetCount = selectedAssetIds?.size ?? 0;
  const hasAssetSelection = selectedAssetCount > 0;
  const canReorderAssets = !!onReorderAssets && assets.length >= 2 && !hasAssetSelection;
  const canSelectAssets =
    !!onEnterAssetSelectionMode && !!onToggleAssetSelection && !!onSelectAssetRange;
  const showAssetSelectionControls = canSelectAssets && isSelectionMode;
  const selectedAssetIdsInOrder = React.useMemo(
    () => assets.filter((asset) => selectedAssetIds?.has(asset.id)).map((asset) => asset.id),
    [assets, selectedAssetIds]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, assetId: Asset['id']) => {
      if (!canReorderAssets) return;
      setDraggedAssetId(assetId);
      setDropTarget(null);
      e.dataTransfer.effectAllowed = 'move';
      try {
        // Safari は dataTransfer に値がないとドラッグが開始されない
        e.dataTransfer.setData('text/plain', String(assetId));
      } catch {}
    },
    [canReorderAssets]
  );

  const commitDropTarget = useCallback(
    (target: AssetGridDropTarget | null) => {
      if (!onReorderAssets || draggedAssetId === null || !target) return;

      const reorderedAssets = reorderAssetsByInsertionIndex(
        assets,
        draggedAssetId,
        target.insertionIndex
      );
      if (reorderedAssets) {
        onReorderAssets(reorderedAssets);
      }
    },
    [assets, draggedAssetId, onReorderAssets]
  );

  const beginDropSettling = useCallback(() => {
    setIsDropSettling(true);
    if (dropSettlingFrameRef.current !== null) {
      window.cancelAnimationFrame(dropSettlingFrameRef.current);
    }
    dropSettlingFrameRef.current = window.requestAnimationFrame(() => {
      dropSettlingFrameRef.current = window.requestAnimationFrame(() => {
        dropSettlingFrameRef.current = null;
        setIsDropSettling(false);
      });
    });
  }, []);

  const handleDropPlaceholderDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropPlaceholderDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canReorderAssets) return;
      e.preventDefault();
      e.stopPropagation();
      beginDropSettling();
      commitDropTarget(dropTarget);
      setDraggedAssetId(null);
      setDropTarget(null);
    },
    [beginDropSettling, canReorderAssets, commitDropTarget, dropTarget]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedAssetId(null);
    setDropTarget(null);
  }, []);

  const handleGridDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) return;
    setDropTarget(null);
  }, []);

  // Responsive columns computed from container width and preferred size
  const containerRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [columns, setColumns] = React.useState<number>(4);
  const preferred = 15 * 16; // 15em
  const minimum = 8 * 16; // 8em
  const dividerBase = 12; // px
  const rowGap = 12; // px vertical gap

  const recomputeColumns = React.useCallback(() => {
    const w =
      gridRef.current?.clientWidth ?? containerRef.current?.clientWidth ?? window.innerWidth;
    let cols = Math.max(1, Math.round((w + dividerBase) / (preferred + dividerBase)));
    const itemW = Math.floor((w - (cols - 1) * dividerBase) / cols);
    if (itemW < minimum) {
      cols = Math.max(1, Math.floor((w + dividerBase) / (minimum + dividerBase)));
    }
    setColumns(cols);
  }, []);

  React.useEffect(() => {
    recomputeColumns();
    const onResize = () => recomputeColumns();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeColumns]);

  React.useEffect(
    () => () => {
      if (dropSettlingFrameRef.current !== null) {
        window.cancelAnimationFrame(dropSettlingFrameRef.current);
      }
    },
    []
  );

  const showSortControl = !!onSortPresetSelect && canSortAssets;
  const showTopBar = showSortControl;
  const gridTopPadding = showTopBar ? 48 : 4;
  const gridWidth = gridRef.current?.clientWidth ?? 0;
  const itemSize =
    gridWidth > 0
      ? Math.floor((gridWidth - (Math.max(1, columns) - 1) * dividerBase) / Math.max(1, columns))
      : 0;
  const dragSourceIndex =
    draggedAssetId === null ? -1 : findAssetGridSourceIndex(assets, draggedAssetId);
  const placeholderIndex = dropTarget && itemSize > 0 ? dropTarget.placeholderIndex : null;
  const placeholderStyle =
    placeholderIndex === null
      ? undefined
      : {
          width: `${itemSize}px`,
          height: `${itemSize}px`,
          transform: `translate3d(${
            (placeholderIndex % Math.max(1, columns)) * (itemSize + dividerBase)
          }px, ${
            gridTopPadding +
            Math.floor(placeholderIndex / Math.max(1, columns)) * (itemSize + rowGap)
          }px, 0)`,
        };

  const getPreviewTransform = useCallback(
    (index: number) => {
      if (!dropTarget || dragSourceIndex < 0 || itemSize <= 0) return undefined;
      const previewIndex = getAssetGridPreviewIndex(
        index,
        dragSourceIndex,
        dropTarget.insertionIndex,
        assets.length
      );
      if (previewIndex === index) return undefined;

      const currentColumn = index % Math.max(1, columns);
      const currentRow = Math.floor(index / Math.max(1, columns));
      const previewColumn = previewIndex % Math.max(1, columns);
      const previewRow = Math.floor(previewIndex / Math.max(1, columns));
      const horizontalStep = itemSize + dividerBase;
      const verticalStep = itemSize + rowGap;
      const translateX = (previewColumn - currentColumn) * horizontalStep;
      const translateY = (previewRow - currentRow) * verticalStep;

      return `translate3d(${translateX}px, ${translateY}px, 0)`;
    },
    [assets.length, columns, dragSourceIndex, dropTarget, itemSize]
  );

  const updateDropTargetFromPoint = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canReorderAssets || draggedAssetId === null || itemSize <= 0 || dragSourceIndex < 0) {
        return dropTarget;
      }

      const gridElement = gridRef.current;
      if (!gridElement) return dropTarget;

      const gridRect = gridElement.getBoundingClientRect();
      const nextPlaceholderIndex = getAssetGridCellIndexFromPoint({
        clientX: e.clientX,
        clientY: e.clientY,
        gridLeft: gridRect.left,
        gridTop: gridRect.top,
        columns: Math.max(1, columns),
        itemSize,
        columnGap: dividerBase,
        rowGap,
        topPadding: gridTopPadding,
        length: assets.length,
      });
      if (nextPlaceholderIndex === null) return dropTarget;

      const insertionIndex = getAssetGridInsertionIndexForPlaceholder(
        dragSourceIndex,
        nextPlaceholderIndex,
        assets.length
      );
      if (
        insertionIndex === null ||
        isAssetGridInsertionNoop(assets, draggedAssetId, insertionIndex)
      ) {
        setDropTarget(null);
        return null;
      }

      const nextTarget = { placeholderIndex: nextPlaceholderIndex, insertionIndex };
      setDropTarget((current) =>
        current &&
        current.placeholderIndex === nextTarget.placeholderIndex &&
        current.insertionIndex === nextTarget.insertionIndex
          ? current
          : nextTarget
      );
      return nextTarget;
    },
    [
      assets,
      canReorderAssets,
      columns,
      dragSourceIndex,
      draggedAssetId,
      dropTarget,
      gridTopPadding,
      itemSize,
    ]
  );

  const handleGridDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (draggedAssetId === null) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      updateDropTargetFromPoint(e);
    },
    [draggedAssetId, updateDropTargetFromPoint]
  );

  const handleGridDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (draggedAssetId === null) return;
      e.preventDefault();
      e.stopPropagation();
      beginDropSettling();
      commitDropTarget(updateDropTargetFromPoint(e));
      setDraggedAssetId(null);
      setDropTarget(null);
    },
    [beginDropSettling, commitDropTarget, draggedAssetId, updateDropTargetFromPoint]
  );

  const getAssetActionIds = useCallback(
    (assetId: Asset['id']) => {
      if (selectedAssetIds?.has(assetId) && selectedAssetIdsInOrder.length > 0) {
        return selectedAssetIdsInOrder;
      }
      return [assetId];
    },
    [selectedAssetIds, selectedAssetIdsInOrder]
  );

  const handleAssetClick = useCallback(
    (event: React.MouseEvent, index: number, asset: Asset) => {
      if (!canSelectAssets) {
        onSelectPage(index, asset);
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (isSelectionMode) {
          onSelectAssetRange?.(asset.id);
          return;
        }
        onEnterAssetSelectionMode?.(asset.id);
        return;
      }

      if (isSelectionMode) {
        event.preventDefault();
        event.stopPropagation();
        onToggleAssetSelection?.(asset.id);
        return;
      }

      onSelectPage(index, asset);
    },
    [
      canSelectAssets,
      isSelectionMode,
      onEnterAssetSelectionMode,
      onSelectAssetRange,
      onSelectPage,
      onToggleAssetSelection,
    ]
  );

  const handleAssetSelectionButtonClick = useCallback(
    (event: React.MouseEvent, assetId: Asset['id']) => {
      event.preventDefault();
      event.stopPropagation();
      onToggleAssetSelection?.(assetId);
    },
    [onToggleAssetSelection]
  );

  const selectionActions = React.useMemo<SelectionAction[]>(() => {
    if (selectedAssetIdsInOrder.length === 0) return [];

    const actions: SelectionAction[] = [];

    if (onDownloadAssets) {
      actions.push({
        label: t.viewerControls.downloadSelectedAssets(selectedAssetIdsInOrder.length),
        value: 'download-selected-assets',
        onSelect: () => onDownloadAssets(selectedAssetIdsInOrder),
        icon: <Download size={12} />,
        group: 'primary',
      });
    }

    if (onSeparateAssets || onSeparateAsset) {
      actions.push({
        label: t.viewerControls.separateSelectedAssets(selectedAssetIdsInOrder.length),
        value: 'separate-selected-assets',
        onSelect: () => {
          if (selectedAssetIdsInOrder.length === 1) {
            onSeparateAsset?.(selectedAssetIdsInOrder[0]);
            return;
          }
          onSeparateAssets?.(selectedAssetIdsInOrder);
        },
        icon: <SplitSquareHorizontal size={12} />,
        group: 'secondary',
        disabled: selectedAssetIdsInOrder.length > 1 && !onSeparateAssets,
      });
    }

    if (selectedAssetIdsInOrder.length >= 2 && onCreateStackFromAssets) {
      actions.push({
        label: t.viewerControls.createStackFromSelectedAssets(selectedAssetIdsInOrder.length),
        value: 'create-stack-from-selected-assets',
        onSelect: () => onCreateStackFromAssets(selectedAssetIdsInOrder),
        icon: <Plus size={12} />,
        group: 'secondary',
      });
    }

    if (onRemoveAssets || onRemoveAsset) {
      actions.push({
        label: t.viewerControls.removeSelectedAssets(selectedAssetIdsInOrder.length),
        value: 'remove-selected-assets',
        onSelect: () => {
          if (selectedAssetIdsInOrder.length === 1) {
            onRemoveAsset?.(selectedAssetIdsInOrder[0]);
            return;
          }
          onRemoveAssets?.(selectedAssetIdsInOrder);
        },
        icon: <Trash2 size={12} />,
        destructive: true,
        disabled: selectedAssetIdsInOrder.length > 1 && !onRemoveAssets,
      });
    }

    return actions;
  }, [
    onCreateStackFromAssets,
    onDownloadAssets,
    onRemoveAsset,
    onRemoveAssets,
    onSeparateAsset,
    onSeparateAssets,
    selectedAssetIdsInOrder,
    t,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn('relative p-4 overflow-auto h-full bg-gray-900', className)}
    >
      {showTopBar && (
        <div className="absolute top-0 left-0 z-20 w-full">
          <div className="w-full bg-black/60 text-white px-4 py-2 flex items-center justify-between gap-2 backdrop-blur-sm border-b border-white/10">
            <span className="text-sm">{t.viewerControls.list}</span>
            <div className="flex items-center gap-2">
              {showSortControl && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="px-3 py-1 rounded transition-colors bg-white/10 text-white hover:bg-white/20 text-sm flex items-center gap-1"
                      aria-label={t.viewerControls.sortAssets}
                    >
                      {t.viewerControls.sort}
                      <ChevronDown size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('filename-asc')}>
                      {t.viewerControls.fileNameAsc}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('filename-desc')}>
                      {t.viewerControls.fileNameDesc}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('created-asc')}>
                      {t.viewerControls.addedAsc}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('created-desc')}>
                      {t.viewerControls.addedDesc}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        ref={gridRef}
        className="relative grid"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)`,
          columnGap: `${dividerBase}px`,
          rowGap: `${rowGap}px`,
          paddingTop: `${gridTopPadding}px`,
        }}
        onDragOver={handleGridDragOver}
        onDragLeave={handleGridDragLeave}
        onDrop={handleGridDrop}
      >
        {placeholderStyle && (
          <div
            className="pointer-events-auto absolute left-0 top-0 z-30 rounded-lg border-2 border-blue-400 bg-blue-400/10 shadow-[0_0_0_1px_rgba(59,130,246,0.35),0_0_16px_rgba(96,165,250,0.35)] transition-transform duration-150 ease-out"
            style={placeholderStyle}
            onDragOver={handleDropPlaceholderDragOver}
            onDrop={handleDropPlaceholderDrop}
          />
        )}
        {assets.map((asset, index) => {
          const isVideo = isVideoAsset(asset);
          const videoSrc = asset.preview || asset.file || asset.url;
          const thumbnailSrc = asset.thumbnail || asset.thumbnailUrl || videoSrc || asset.file;
          const isDragging = draggedAssetId !== null && String(draggedAssetId) === String(asset.id);
          const isAssetSelected = selectedAssetIds?.has(asset.id) ?? false;
          const contextActionIds = getAssetActionIds(asset.id);
          const contextActionCount = contextActionIds.length;
          const canSeparateAction =
            contextActionCount === 1 ? !!onSeparateAsset : !!onSeparateAssets;
          const canRemoveAction = contextActionCount === 1 ? !!onRemoveAsset : !!onRemoveAssets;
          const isAssetFavorited = Boolean(asset.favorited ?? asset.isFavorite);
          const assetLikeCount = getAssetLikeCount(asset);
          const showAssetFavoriteButton =
            !isSelectionMode && (!!onToggleAssetFavorite || isAssetFavorited);
          const showAssetLikeBadge = !isSelectionMode && assetLikeCount > 0;
          const showInlineRemoveButton = !!onRemoveAsset && !hasAssetSelection && !isSelectionMode;
          const displayName = getAssetDisplayName(asset);
          const previewTransform = getPreviewTransform(index);
          const isDragPlaceholder = isDragging && !!dropTarget;

          const content = (
            <div
              className={cn(
                'relative overflow-hidden cursor-pointer group aspect-square',
                'bg-gray-800 transform-gpu',
                isDropSettling ? 'transition-none' : 'transition-transform duration-150 ease-out',
                isDragging &&
                  (isDragPlaceholder ? 'opacity-0 scale-[0.98]' : 'opacity-50 scale-[0.98]'),
                isAssetSelected && 'ring-2 ring-blue-400 ring-inset',
                canReorderAssets && 'cursor-move'
              )}
              onClick={(event) => handleAssetClick(event, index, asset)}
              draggable={canReorderAssets}
              onDragStart={(e) => handleDragStart(e, asset.id)}
              onDragEnd={handleDragEnd}
            >
              {/* ドラッグ先の表示が埋もれないよう、並び替え可能なときは少し内側に収める */}
              <div
                className={cn(
                  'w-full h-full transition-transform',
                  canReorderAssets ? 'scale-[0.96]' : 'gap-0'
                )}
              >
                {isVideo ? (
                  <video
                    src={videoSrc || ''}
                    className="w-full h-full object-cover"
                    muted
                    draggable={false}
                    poster={asset.thumbnail || asset.thumbnailUrl}
                  />
                ) : (
                  <img
                    src={thumbnailSrc}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                    loading="lazy"
                  />
                )}
              </div>
              {/* No page index badge in list grid */}

              {(showAssetFavoriteButton || showAssetLikeBadge) && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                  {showAssetFavoriteButton && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleAssetFavorite?.(asset.id);
                      }}
                      className={cn(
                        'p-1 rounded-full transition-all duration-200',
                        isAssetFavorited
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/80 text-gray-700 hover:bg-white'
                      )}
                      aria-label={
                        isAssetFavorited
                          ? t.viewerControls.removeAssetBookmark
                          : t.viewerControls.bookmarkAsset
                      }
                    >
                      <Bookmark size={14} className={isAssetFavorited ? 'fill-current' : ''} />
                    </button>
                  )}

                  {showAssetLikeBadge && (
                    <div className="flex items-center gap-1 bg-like text-white px-2 py-1 rounded-full text-xs font-medium">
                      <Heart size={12} className="fill-current" />
                      <span>{assetLikeCount}</span>
                    </div>
                  )}
                </div>
              )}

              {isAssetSelected && (
                <div className="absolute inset-0 bg-blue-500/20 transition-opacity pointer-events-none" />
              )}

              {showAssetSelectionControls && (
                <button
                  type="button"
                  onClick={(event) => handleAssetSelectionButtonClick(event, asset.id)}
                  className={cn(
                    'absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border transition-colors',
                    isAssetSelected
                      ? 'border-blue-300 bg-blue-500 text-white'
                      : 'border-white/45 bg-black/45 text-white hover:bg-black/65'
                  )}
                  aria-label={
                    isAssetSelected ? t.viewerControls.deselectAsset : t.viewerControls.selectAsset
                  }
                >
                  {isAssetSelected ? (
                    <Check size={16} />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-current" />
                  )}
                </button>
              )}

              {/* Original filename overlay (bottom-left) */}
              {displayName && (
                <div
                  className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] px-1.5 py-0.5 bg-black/55 text-white text-[10px] leading-tight pointer-events-none truncate"
                  title={displayName}
                >
                  {displayName}
                </div>
              )}

              {/* Remove button (shown when removal is enabled by parent) */}
              {showInlineRemoveButton && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAsset(asset.id);
                  }}
                  className={cn(
                    'absolute z-20 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-all',
                    'bottom-1 right-1'
                  )}
                >
                  <X size={16} />
                </button>
              )}

              {/* Hover overlay */}
              <div
                className={cn(
                  'absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none',
                  isAssetSelected && 'group-hover:opacity-0'
                )}
              />
            </div>
          );

          return (
            <ContextMenu key={asset.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'relative transform-gpu',
                    isDropSettling
                      ? 'transition-none'
                      : 'transition-transform duration-150 ease-out',
                    isDragPlaceholder && 'pointer-events-none'
                  )}
                  style={previewTransform ? { transform: previewTransform } : undefined}
                >
                  {content}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                {contextActionCount === 1 && onToggleAssetFavorite && (
                  <ContextMenuItem
                    onClick={(event) => {
                      event.preventDefault();
                      onToggleAssetFavorite(contextActionIds[0]);
                    }}
                  >
                    <Bookmark className={cn('w-4 h-4 mr-2', isAssetFavorited && 'fill-current')} />
                    {isAssetFavorited
                      ? t.viewerControls.removeAssetBookmark
                      : t.viewerControls.bookmarkAsset}
                  </ContextMenuItem>
                )}
                {contextActionCount === 1 && onLikeAsset && (
                  <ContextMenuItem
                    onClick={(event) => {
                      event.preventDefault();
                      onLikeAsset(contextActionIds[0]);
                    }}
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    {t.viewerControls.likeAsset}
                  </ContextMenuItem>
                )}
                {contextActionCount === 1 && (onToggleAssetFavorite || onLikeAsset) && (
                  <ContextMenuSeparator />
                )}
                {onDownloadAssets && (
                  <ContextMenuItem
                    onClick={(event) => {
                      event.preventDefault();
                      onDownloadAssets(contextActionIds);
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {contextActionCount > 1
                      ? t.viewerControls.downloadSelectedAssets(contextActionCount)
                      : t.viewer.downloadPage}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    if (contextActionCount === 1) {
                      onSeparateAsset?.(contextActionIds[0]);
                      return;
                    }
                    onSeparateAssets?.(contextActionIds);
                  }}
                  disabled={!canSeparateAction}
                >
                  <SplitSquareHorizontal className="w-4 h-4 mr-2" />
                  {contextActionCount > 1
                    ? t.viewerControls.separateSelectedAssets(contextActionCount)
                    : t.viewerControls.separateAsset}
                </ContextMenuItem>
                {contextActionCount >= 2 && onCreateStackFromAssets && (
                  <ContextMenuItem
                    onClick={(event) => {
                      event.preventDefault();
                      onCreateStackFromAssets(contextActionIds);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t.viewerControls.createStackFromSelectedAssets(contextActionCount)}
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-red-600 focus:text-red-600 hover:text-red-600"
                  onClick={(event) => {
                    event.preventDefault();
                    if (contextActionCount === 1) {
                      onRemoveAsset?.(contextActionIds[0]);
                      return;
                    }
                    onRemoveAssets?.(contextActionIds);
                  }}
                  disabled={!canRemoveAction}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {contextActionCount > 1
                    ? t.viewerControls.removeSelectedAssets(contextActionCount)
                    : t.viewerControls.removeAsset}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      <SelectionActionBar
        isActive={hasAssetSelection}
        selectedCount={selectedAssetCount}
        onClearSelection={onClearAssetSelection ?? (() => {})}
        onExitSelectionMode={onClearAssetSelection ?? (() => {})}
        actions={selectionActions}
      />
    </div>
  );
}
