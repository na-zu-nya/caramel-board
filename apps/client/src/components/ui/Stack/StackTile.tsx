import { Book, Check, Heart, Star } from 'lucide-react';
import { cloneElement, isValidElement, type ReactElement, useCallback, useState } from 'react';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getThumbnailPath } from '@/utils/thumbnailPath';
import {
  type StackContextCollectionMenuProps,
  StackContextMenuContent,
} from './StackContextMenuContent';

export interface StackTileProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  cornerRadius?: 'rounded' | 'none';
  // Visual data
  thumbnailUrl?: string | null;
  nativeImageDragUrl?: string | null;
  title?: string;
  pageCount?: number;
  favorited?: boolean;
  likeCount?: number;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  isInfoSelected?: boolean;
  selectedActionCount?: number;
  // Actions
  onOpen?: () => void;
  onInfo?: () => void;
  onFindSimilar?: () => void;
  onAddToScratch?: () => void;
  collectionMenu?: StackContextCollectionMenuProps;
  onDownload?: () => void;
  onDownloadSelected?: () => void;
  onRefresh?: () => void;
  onBulkEditSelected?: () => void;
  onMergeSelected?: () => void;
  onRemoveSelectedStacks?: () => void;
  onToggleSelection?: () => void;
  onToggleFavorite?: () => void;
  onLike?: () => void;
  onRemoveLike?: () => void;
  onRemoveFromCollection?: () => void;
  onRemoveFromScratch?: () => void;
  onRemoveStack?: () => void;
  // Drag source props (from hook)
  dragHandlers?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

export function StackTile({
  asChild,
  cornerRadius = 'rounded',
  thumbnailUrl,
  nativeImageDragUrl,
  title,
  pageCount,
  favorited,
  likeCount,
  isSelectionMode = false,
  isSelected = false,
  isInfoSelected = false,
  selectedActionCount = 0,
  onOpen,
  onInfo,
  onFindSimilar,
  onAddToScratch,
  collectionMenu,
  onDownload,
  onDownloadSelected,
  onRefresh,
  onBulkEditSelected,
  onMergeSelected,
  onRemoveSelectedStacks,
  onToggleSelection,
  onToggleFavorite,
  onLike,
  onRemoveLike,
  onRemoveFromCollection,
  onRemoveFromScratch,
  onRemoveStack,
  dragHandlers,
  className,
  children,
  ...divProps
}: StackTileProps) {
  const t = useT();
  const [isNativePointerActive, setIsNativePointerActive] = useState(false);
  const [isNativeDragReady, setIsNativeDragReady] = useState(false);
  const isSelectionContext = isSelectionMode && isSelected && selectedActionCount > 0;
  const hasRemoveStackAction = Boolean(
    onRemoveStack || (isSelectionContext && onRemoveSelectedStacks)
  );
  const resolvedThumbnailUrl = thumbnailUrl
    ? thumbnailUrl.startsWith('http')
      ? thumbnailUrl
      : getThumbnailPath(thumbnailUrl)
    : null;
  const resolvedNativeImageDragUrl = nativeImageDragUrl
    ? nativeImageDragUrl.startsWith('http')
      ? nativeImageDragUrl
      : getThumbnailPath(nativeImageDragUrl)
    : resolvedThumbnailUrl;
  const enableNativeImageDrag = useCallback(() => {
    if (isSelectionMode) return;
    if (resolvedNativeImageDragUrl) {
      setIsNativeDragReady(true);
    }
  }, [isSelectionMode, resolvedNativeImageDragUrl]);
  const disableNativeImageDrag = useCallback(() => {
    if (!isNativePointerActive) {
      setIsNativeDragReady(false);
    }
  }, [isNativePointerActive]);
  const handleDownload = useCallback(() => {
    if (isSelectionContext && onDownloadSelected) {
      onDownloadSelected();
      return;
    }
    onDownload?.();
  }, [isSelectionContext, onDownload, onDownloadSelected]);
  const handleRemoveStack = useCallback(() => {
    if (isSelectionContext && onRemoveSelectedStacks) {
      const confirmed = window.confirm(t.grid.deleteStacksConfirm(selectedActionCount));
      if (!confirmed) return;
      onRemoveSelectedStacks();
      return;
    }
    onRemoveStack?.();
  }, [isSelectionContext, onRemoveSelectedStacks, onRemoveStack, selectedActionCount, t]);

  const body = (
    <div
      className={cn(
        'group relative aspect-square overflow-hidden bg-gray-100 cursor-pointer',
        cornerRadius === 'rounded' ? 'rounded-lg border border-gray-200' : 'rounded-none',
        isInfoSelected && 'ring-2 ring-primary ring-inset',
        isNativePointerActive && 'scale-95 opacity-50',
        className
      )}
      {...dragHandlers}
      {...divProps}
      onPointerEnter={enableNativeImageDrag}
      onPointerLeave={disableNativeImageDrag}
      onFocus={enableNativeImageDrag}
      onBlur={disableNativeImageDrag}
    >
      {thumbnailUrl ? (
        <img
          src={resolvedThumbnailUrl ?? undefined}
          alt={title || t.common.untitled}
          className="w-full h-full object-cover"
          loading="lazy"
          data-stack-drag-preview="true"
          onError={(e) => {
            e.currentTarget.src = '/no-image.png';
          }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50"
          data-stack-drag-preview="true"
        >
          {t.viewerControls.noImage}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-white opacity-0 transition-opacity duration-150 group-hover:opacity-10" />
      {isNativeDragReady && resolvedNativeImageDragUrl ? (
        <img
          src={resolvedNativeImageDragUrl}
          alt=""
          className="absolute inset-0 z-[5] h-full w-full object-cover opacity-0"
          draggable={true}
          data-native-image-drag="true"
          onDragStart={() => setIsNativePointerActive(true)}
          onDragEnd={() => {
            setIsNativePointerActive(false);
            setIsNativeDragReady(false);
          }}
          aria-hidden="true"
        />
      ) : null}

      {isSelectionMode && isSelected ? (
        <div className="absolute inset-0 bg-black opacity-30 transition-opacity duration-200" />
      ) : null}

      {isSelectionMode ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelection?.();
          }}
          className={cn(
            'absolute top-2 right-2 p-1 rounded-full z-20',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-white/80 text-gray-700 hover:bg-white transition-colors duration-200'
          )}
          aria-label={t.header.selectionMode}
        >
          {isSelected ? (
            <Check size={16} />
          ) : (
            <div className="w-4 h-4 border border-current rounded-full" />
          )}
        </button>
      ) : null}

      {/* Page count (right-top) */}
      {pageCount && pageCount > 1 && (
        <div className={cn('absolute z-10', isSelectionMode ? 'top-2 left-2' : 'top-2 right-2')}>
          <div className="flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-full text-xs font-medium">
            <Book size={12} />
            <span>{pageCount}</span>
          </div>
        </div>
      )}

      {/* Favorite (left-bottom) */}
      {!isSelectionMode && (onToggleFavorite || favorited) ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleFavorite?.();
          }}
          className={cn(
            'absolute bottom-2 left-2 p-1 rounded-full z-10 transition-colors',
            favorited ? 'bg-yellow-500 text-white' : 'bg-white/80 text-gray-700 hover:bg-white'
          )}
          aria-label={favorited ? t.contextMenu.removeFavorite : t.contextMenu.addFavorite}
        >
          <Star size={16} className={favorited ? 'fill-current' : ''} />
        </button>
      ) : null}

      {/* Like (right-bottom) - hide badge completely when count is 0 or undefined */}
      {!isSelectionMode && typeof likeCount === 'number' && likeCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onLike?.();
          }}
          className="absolute bottom-2 right-2 flex items-center gap-1 bg-like text-white px-2 py-1 rounded-full text-xs font-medium z-10 hover:opacity-90"
          aria-label={t.viewerControls.like}
        >
          <Heart size={12} className="fill-current" />
          <span>{likeCount}</span>
        </button>
      )}
    </div>
  );

  const wrapped = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {asChild && isValidElement(children)
          ? cloneElement(children as ReactElement<{ children?: React.ReactNode }>, {
              children: body,
            })
          : body}
      </ContextMenuTrigger>
      <StackContextMenuContent
        isSelectionContext={isSelectionContext}
        selectedActionCount={selectedActionCount}
        onOpen={onOpen}
        onBulkEditSelected={onBulkEditSelected}
        onDownload={onDownload ? handleDownload : undefined}
        onRefresh={onRefresh}
        onInfo={onInfo}
        onFindSimilar={onFindSimilar}
        onAddToScratch={onAddToScratch}
        collectionMenu={collectionMenu}
        onMergeSelected={isSelectionContext ? onMergeSelected : undefined}
        onRemoveLike={onRemoveLike}
        onRemoveFromCollection={onRemoveFromCollection}
        onRemoveFromScratch={onRemoveFromScratch}
        onRemoveStack={hasRemoveStackAction ? handleRemoveStack : undefined}
      />
    </ContextMenu>
  );

  if (asChild && isValidElement(children)) return wrapped;
  return <div>{wrapped}</div>;
}
