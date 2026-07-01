import { ChevronDown, SplitSquareHorizontal, Trash2, X } from 'lucide-react';
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

export default function AssetGrid({
  assets,
  onSelectPage,
  onRemoveAsset,
  onSeparateAsset,
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
  const canReorderAssets = !!onReorderAssets && assets.length >= 2;

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
          const displayName = getAssetDisplayName(asset);
          const previewTransform = getPreviewTransform(index);
          const isDragPlaceholder = isDragging && !!dropTarget;

          const content = (
            <div
              className={cn(
                'relative overflow-hidden rounded-lg cursor-pointer group aspect-square',
                'bg-gray-800 transform-gpu',
                isDropSettling ? 'transition-none' : 'transition-transform duration-150 ease-out',
                isDragging &&
                  (isDragPlaceholder ? 'opacity-0 scale-[0.98]' : 'opacity-50 scale-[0.98]'),
                canReorderAssets && 'cursor-move'
              )}
              onClick={() => {
                onSelectPage(index, asset);
              }}
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

              {/* Original filename overlay (bottom-left) */}
              {displayName && (
                <div
                  className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] px-1.5 py-0.5 rounded bg-black/55 text-white text-[10px] leading-tight pointer-events-none truncate"
                  title={displayName}
                >
                  {displayName}
                </div>
              )}

              {/* Remove button (shown when removal is enabled by parent) */}
              {onRemoveAsset && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAsset(asset.id);
                  }}
                  className="absolute bottom-1 right-1 z-20 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={16} />
                </button>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" />
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
              <ContextMenuContent className="w-40">
                <ContextMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    onSeparateAsset?.(asset.id);
                  }}
                  disabled={!onSeparateAsset}
                >
                  <SplitSquareHorizontal className="w-4 h-4 mr-2" />
                  {t.viewerControls.separateAsset}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-red-600 focus:text-red-600 hover:text-red-600"
                  onClick={(event) => {
                    event.preventDefault();
                    onRemoveAsset?.(asset.id);
                  }}
                  disabled={!onRemoveAsset}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t.viewerControls.removeAsset}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
