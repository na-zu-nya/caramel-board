import { ArrowUpDown, ChevronDown, SplitSquareHorizontal, Trash2, X } from 'lucide-react';
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
import { isVideoAsset } from '@/lib/media';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types';
import type { AssetSortPreset } from './StackToolbar';

interface AssetGridProps {
  assets: Asset[];
  currentPage: number;
  onSelectPage: (page: number) => void;
  onRemoveAsset?: (assetId: string | number) => void;
  onSeparateAsset?: (assetId: string | number) => void;
  onReorderAssets?: (assets: Asset[]) => void;
  isEditMode?: boolean;
  className?: string;
  reorderBanner?: {
    show: boolean;
    canSave: boolean;
    saving?: boolean;
    onSave: () => void;
    onCancel: () => void;
  };
  // Top action bar (list mode)
  onSortPresetSelect?: (preset: AssetSortPreset) => void;
  canSortAssets?: boolean;
  onReorderToggle?: () => void;
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
  isEditMode = false,
  className,
  reorderBanner,
  onSortPresetSelect,
  canSortAssets = false,
  onReorderToggle,
}: AssetGridProps) {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [hoverDividerIndex, setHoverDividerIndex] = useState<number | null>(null);

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      if (!isEditMode || !onReorderAssets) return;
      setDraggedItem(index);
      e.dataTransfer.effectAllowed = 'move';
      try {
        // Safari requires data to be set to initiate drag
        e.dataTransfer.setData('text/plain', 'drag');
      } catch {}
    },
    [isEditMode, onReorderAssets]
  );

  // Divider drag over
  const handleDividerDragOver = useCallback(
    (e: React.DragEvent, insertIndex: number) => {
      if (!isEditMode || !onReorderAssets || draggedItem === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setHoverDividerIndex(insertIndex);
    },
    [isEditMode, onReorderAssets, draggedItem]
  );

  // Handle drop on divider (insert at index)
  const handleDividerDrop = useCallback(
    (e: React.DragEvent, insertIndexRaw: number) => {
      if (!isEditMode || !onReorderAssets || draggedItem === null) return;
      e.preventDefault();
      let newAssets = [...assets];
      const targetIndex = Math.max(0, Math.min(newAssets.length, insertIndexRaw));
      const [draggedAsset] = newAssets.splice(draggedItem, 1);
      let insertIndex = targetIndex;
      if (draggedItem < targetIndex) insertIndex -= 1; // account for removal shift
      newAssets.splice(insertIndex, 0, draggedAsset);

      // Reindex order
      newAssets = newAssets.map((a, i) => ({ ...a, orderInStack: i }));

      onReorderAssets(newAssets);

      setDraggedItem(null);
      setHoverDividerIndex(null);
    },
    [isEditMode, onReorderAssets, draggedItem, assets]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setHoverDividerIndex(null);
  }, []);

  // Responsive columns computed from container width and preferred size
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [columns, setColumns] = React.useState<number>(4);
  const preferred = 15 * 16; // 15em
  const minimum = 8 * 16; // 8em
  const dividerBase = 12; // px
  const rowGap = 12; // px vertical gap

  const recomputeColumns = React.useCallback(() => {
    const w = containerRef.current?.clientWidth ?? window.innerWidth;
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

  const isReorderMode = isEditMode;
  const showSortControl = !!onSortPresetSelect && canSortAssets;
  const showReorderControl = !!onReorderToggle;
  const showSaveCancel = !!reorderBanner?.show;
  const showTopBar = showSortControl || showReorderControl || showSaveCancel;

  return (
    <div ref={containerRef} className={cn('p-4 overflow-auto h-full bg-gray-900', className)}>
      {showTopBar && (
        <div className="absolute top-0 left-0 z-20 w-full">
          <div className="w-full bg-black/60 text-white px-4 py-2 flex items-center justify-between gap-2 backdrop-blur-sm border-b border-white/10">
            <span className="text-sm">
              {isReorderMode
                ? `並び替えモード ${reorderBanner?.canSave ? '(変更あり)' : ''}`
                : '一覧'}
            </span>
            <div className="flex items-center gap-2">
              {showSortControl && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="px-3 py-1 rounded transition-colors bg-white/10 text-white hover:bg-white/20 text-sm flex items-center gap-1"
                      aria-label="Sort assets"
                    >
                      ソート
                      <ChevronDown size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('filename-asc')}>
                      ファイル名 昇順
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('filename-desc')}>
                      ファイル名 降順
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('created-asc')}>
                      追加順 昇順
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSortPresetSelect?.('created-desc')}>
                      追加順 降順
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {showReorderControl && !showSaveCancel && (
                <button
                  type="button"
                  onClick={onReorderToggle}
                  className={cn(
                    'p-2 rounded-full transition-colors',
                    isReorderMode
                      ? 'bg-green-500 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  )}
                  aria-label={isReorderMode ? 'Exit reorder mode' : 'Enter reorder mode'}
                >
                  <ArrowUpDown size={16} />
                </button>
              )}
              {showSaveCancel && reorderBanner && (
                <>
                  <button
                    type="button"
                    onClick={reorderBanner.onCancel}
                    className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={!reorderBanner.canSave || reorderBanner.saving}
                    onClick={reorderBanner.onSave}
                    className={cn(
                      'px-3 py-1 rounded transition',
                      reorderBanner.canSave && !reorderBanner.saving
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : 'bg-white/20 cursor-not-allowed'
                    )}
                  >
                    {reorderBanner.saving ? '保存中…' : '保存'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        className={cn('grid', showTopBar ? 'pt-12' : 'pt-1')}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)`,
          columnGap: `${dividerBase}px`,
          rowGap: `${rowGap}px`,
        }}
      >
        {assets.map((asset, index) => {
          const isVideo = isVideoAsset(asset);
          const videoSrc = asset.preview || asset.file || asset.url;
          const thumbnailSrc = asset.thumbnail || asset.thumbnailUrl || videoSrc || asset.file;
          const isDragging = draggedItem === index;
          const displayName = getAssetDisplayName(asset);
          // Grid handles item sizing; maintain 1:1 via aspect-square

          // Visual shift around hovered divider (no layout shift)
          let translateX = 0;
          if (isEditMode && hoverDividerIndex !== null) {
            if (index === hoverDividerIndex - 1) translateX = -6; // left of divider
            if (index === hoverDividerIndex) translateX = 6; // right of divider
          }

          // Drop indicator bars: show one bar at hovered divider position
          const showLeftBar = isEditMode && hoverDividerIndex === index;
          const showRightBar =
            isEditMode && hoverDividerIndex === assets.length && index === assets.length - 1;

          const content = (
            <div
              className={cn(
                'relative overflow-hidden rounded-lg cursor-pointer group aspect-square',
                'bg-gray-800 transform-gpu transition-transform duration-150 ease-out',
                isDragging && 'opacity-50 scale-[0.98]',
                isEditMode && 'cursor-move'
              )}
              style={{ transform: `translateX(${translateX}px)` }}
              onClick={() => {
                if (isEditMode) return;
                onSelectPage(index);
              }}
              draggable={isEditMode}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
            >
              {isEditMode && (
                <>
                  {/* Left half = insert BEFORE this item */}
                  <div
                    className="absolute inset-y-0 left-0 w-1/2 z-10"
                    onDragOver={(e) => handleDividerDragOver(e, index)}
                    onDrop={(e) => handleDividerDrop(e, index)}
                  />
                  {/* Right half = insert AFTER this item */}
                  <div
                    className="absolute inset-y-0 right-0 w-1/2 z-10"
                    onDragOver={(e) => handleDividerDragOver(e, index + 1)}
                    onDrop={(e) => handleDividerDrop(e, index + 1)}
                  />
                </>
              )}
              {/* Thumbnail with slight shrink in edit mode to create spacing */}
              <div
                className={cn(
                  'w-full h-full transition-transform',
                  isEditMode ? 'scale-[0.96]' : 'gap-0'
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
                  className="absolute bottom-1 right-1 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={16} />
                </button>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" />
            </div>
          );

          if (isEditMode) {
            return (
              <div key={asset.id} className="relative">
                {content}
                {showLeftBar && (
                  <div
                    className="absolute top-1 bottom-1 w-1 bg-blue-500 rounded-full pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                    style={{ left: '-8px' }}
                  />
                )}
                {showRightBar && (
                  <div
                    className="absolute top-1 bottom-1 w-1 bg-blue-500 rounded-full pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                    style={{ right: '-8px' }}
                  />
                )}
              </div>
            );
          }

          return (
            <ContextMenu key={asset.id}>
              <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
              <ContextMenuContent className="w-40">
                <ContextMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    onSeparateAsset?.(asset.id);
                  }}
                  disabled={!onSeparateAsset}
                >
                  <SplitSquareHorizontal className="w-4 h-4 mr-2" />
                  Separate
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
                  Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
