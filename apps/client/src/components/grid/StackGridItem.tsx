import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Book,
  Bookmark,
  Check,
  Download,
  GalleryVerticalEnd,
  GitMerge,
  Heart,
  Info,
  NotebookText,
  Star,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useDrag } from '@/contexts/DragContext';
import { useScratch } from '@/hooks/useScratch';
import { apiClient } from '@/lib/api-client';
import { downloadStackOriginals } from '@/lib/download-originals';
import { removeStackFromCache } from '@/lib/stack-cache';
import {
  extractStackIdsFromDragPayload,
  getSourceImageFilename,
  getSourceImageUrl,
  hasStackDragPayload,
  setExternalImageDragData,
  setNativeImageDragPreview,
  setStackDragData,
} from '@/lib/stack-drag-data';
import { cn } from '@/lib/utils';
import { navigationStateAtom } from '@/stores/navigation';
import { currentFilterAtom, infoSidebarOpenAtom, selectedItemIdAtom } from '@/stores/ui';
import type { MediaGridItem } from '@/types';

const getCurrentReturnTo = () => {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

interface StackGridItemProps {
  item: MediaGridItem;
  isSelected: boolean;
  isInfoSelected: boolean;
  isSelectionMode: boolean;
  isFavoritePending: boolean;
  overrideFavorited?: boolean;
  onItemClick: (item: MediaGridItem, event?: React.MouseEvent) => void;
  onToggleSelection: (itemId: string | number) => void;
  onToggleFavorite: (item: MediaGridItem, event: React.MouseEvent) => void;
  selectedItems?: Set<string | number>;
  selectedStackIdsInOrder?: number[];
  onMergeStacks?: () => void | Promise<void>;
  allowRemoveFromCollection?: boolean;
  onRemoveFromCollection?: (id: string | number) => void | Promise<void>;
  allowRemoveFromScratch?: boolean;
  onRemoveFromScratch?: (id: string | number) => void | Promise<void>;
}

export function StackGridItem({
  item,
  isSelected,
  isInfoSelected,
  isSelectionMode,
  isFavoritePending,
  overrideFavorited,
  onItemClick,
  onToggleSelection,
  onToggleFavorite,
  selectedItems,
  selectedStackIdsInOrder,
  onMergeStacks,
  allowRemoveFromCollection = false,
  onRemoveFromCollection,
  allowRemoveFromScratch = false,
  onRemoveFromScratch,
}: StackGridItemProps) {
  const currentFavorited = overrideFavorited ?? item.favorited ?? item.isFavorite ?? false;
  const thumbnailUrl = item.thumbnail || item.thumbnailUrl || '/no-image.png';
  const favoriteKind = item.favoriteKind;
  const getStackId = useCallback(() => item.stackId ?? item.id, [item.id, item.stackId]);
  const sourceImageUrl = getSourceImageUrl(item, thumbnailUrl);
  const sourceImageFilename = sourceImageUrl
    ? getSourceImageFilename(item, sourceImageUrl, `stack-${getStackId()}`)
    : 'image.jpg';
  const toNumber = useCallback((value: unknown): number | null => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }, []);
  const likeCount = toNumber(item.likeCount) ?? toNumber(item.liked) ?? toNumber(item.likes) ?? 0;
  const assetCount = toNumber(item.assetCount);
  const countAssets = toNumber((item._count as { assets?: unknown } | undefined)?.assets);
  const pageCount = assetCount ?? countAssets ?? 0;
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isNativeDragReady, setIsNativeDragReady] = useState(false);
  const {
    draggedStack,
    setDraggedStack,
    setDragKind,
    setIsDragging: setGlobalDragging,
  } = useDrag();
  const [filter] = useAtom(currentFilterAtom);
  const datasetId = (filter?.datasetId as string) || '1';
  const { ensureScratch } = useScratch(datasetId);
  const navigate = useNavigate();
  const setInfoOpen = useSetAtom(infoSidebarOpenAtom);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const setNavigationState = useSetAtom(navigationStateAtom);
  const selectedInfoId = useAtomValue(selectedItemIdAtom);
  const queryClient = useQueryClient();
  const canMergeSelectedStacks =
    isSelectionMode &&
    (selectedStackIdsInOrder?.length ?? 0) >= 2 &&
    !!selectedItems?.has(item.id) &&
    typeof onMergeStacks === 'function';
  const returnTo = getCurrentReturnTo();
  const stackLinkSearch = {
    ...(favoriteKind === 'asset' && typeof item.favoritePage === 'number'
      ? { page: item.favoritePage - 1 }
      : {}),
    ...(item.mediaType ? { mediaType: item.mediaType } : {}),
    ...(returnTo ? { returnTo } : {}),
  };
  const getDownloadStackIds = useCallback((): Array<string | number> => {
    if (isSelectionMode && selectedItems?.has(item.id)) {
      if (selectedStackIdsInOrder && selectedStackIdsInOrder.length > 0) {
        return selectedStackIdsInOrder;
      }
      return Array.from(selectedItems);
    }
    return [getStackId()];
  }, [getStackId, isSelectionMode, item.id, selectedItems, selectedStackIdsInOrder]);
  const handleDownloadOriginals = useCallback(() => {
    downloadStackOriginals(datasetId, getDownloadStackIds());
  }, [datasetId, getDownloadStackIds]);
  const saveNavigationPosition = useCallback(() => {
    setNavigationState({
      scrollPosition: window.scrollY,
      total: 0,
      items: [],
      lastPath: window.location.pathname,
    });
  }, [setNavigationState]);
  const handleContextOpen = useCallback(async () => {
    saveNavigationPosition();
    const ds = datasetId || '1';
    const stackId = getStackId();
    const id = typeof stackId === 'string' ? Number.parseInt(stackId, 10) : stackId;
    await navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId: ds, stackId: String(id) },
      search:
        favoriteKind === 'asset' && typeof item.favoritePage === 'number'
          ? { page: item.favoritePage - 1 }
          : undefined,
    });
  }, [datasetId, favoriteKind, getStackId, item.favoritePage, navigate, saveNavigationPosition]);
  const enableNativeImageDrag = useCallback(() => {
    if (sourceImageUrl) {
      setIsNativeDragReady(true);
    }
  }, [sourceImageUrl]);
  const disableNativeImageDrag = useCallback(() => {
    if (!isDragging) {
      setIsNativeDragReady(false);
    }
  }, [isDragging]);
  const invalidateStackData = useCallback(() => {
    void Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['stack'] }),
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] }),
      queryClient.invalidateQueries({ queryKey: ['likes', 'yearly'] }),
      queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
    ]);
  }, [datasetId, queryClient]);

  // Fade-in animation state
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenSeen, setHasBeenSeen] = useState(false);
  const itemRef = useRef<HTMLAnchorElement>(null);

  // Intersection Observer for fade-in animation
  useEffect(() => {
    const element = itemRef.current;
    if (!element || hasBeenSeen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasBeenSeen) {
            setIsVisible(true);
            setHasBeenSeen(true);
            observer.unobserve(element);
          }
        }
      },
      {
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: '50px', // Start animation slightly before fully in view
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [hasBeenSeen]);

  const handleRemoveStack = useCallback(async () => {
    const label =
      typeof item.title === 'string' && item.title.length > 0
        ? item.title
        : item.name || 'Untitled';
    const confirmed = window.confirm(
      `Are you sure you want to remove the stack "${label}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    const numericId = toNumber(item.id);
    if (numericId === null) {
      console.error('Invalid stack id for removal:', item.id);
      return;
    }

    try {
      await apiClient.removeStack(numericId);
      removeStackFromCache(queryClient, numericId);

      if (selectedInfoId && String(selectedInfoId) === String(item.id)) {
        setSelectedItemId(null);
        setInfoOpen(false);
      }

      invalidateStackData();
      console.log('✅ Stack removed from grid');
    } catch (error) {
      console.error('❌ Failed to remove stack:', error);
      alert('Failed to remove stack. Please try again.');
    }
  }, [
    invalidateStackData,
    item,
    queryClient,
    selectedInfoId,
    setInfoOpen,
    setSelectedItemId,
    toNumber,
  ]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          ref={itemRef}
          key={item.id}
          to="/library/$datasetId/stacks/$stackId"
          params={{ datasetId, stackId: String(getStackId()) }}
          search={stackLinkSearch}
          data-item-id={item.id}
          className={cn(
            'group relative aspect-square overflow-hidden cursor-pointer transition-transform duration-150 box-border block',
            isInfoSelected && 'ring-2 ring-primary ring-inset',
            isVisible ? 'opacity-100' : 'opacity-0',
            isDragging ? 'border-8 border-gray-300 scale-95 opacity-50 rounded-lg' : '',
            isDragOver && 'border-8 border-accent'
          )}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            onItemClick(item, e);
          }}
          draggable={true}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault();
              onItemClick(item);
            }
          }}
          onPointerEnter={enableNativeImageDrag}
          onPointerLeave={disableNativeImageDrag}
          onFocus={enableNativeImageDrag}
          onBlur={disableNativeImageDrag}
          onDragEnd={() => {
            console.log('Drag ended for item:', item.id);
            setIsDragging(false);
            setGlobalDragging(false);
            setIsNativeDragReady(false);
          }}
          onDragStart={(e) => {
            if ((e.target as HTMLElement | null)?.dataset.nativeImageDrag === 'true') {
              setIsDragging(true);
              setGlobalDragging(true);
              setDragKind('native-image');
              setDraggedStack({ stackId: getStackId(), collectionIds: [] });
              setNativeImageDragPreview(e.dataTransfer, e.currentTarget);
              return;
            }

            console.log('Drag started for item:', item.id);
            setIsDragging(true);
            setGlobalDragging(true);
            setDraggedStack({ stackId: getStackId(), collectionIds: [] });

            // Check if this item is part of a selection
            let dragStackIds: Array<string | number> = [getStackId()];
            if (isSelectionMode && selectedItems && selectedItems.size > 0) {
              // If the dragged item is selected, drag all selected items
              if (selectedItems.has(item.id)) {
                dragStackIds =
                  selectedStackIdsInOrder && selectedStackIdsInOrder.length > 0
                    ? selectedStackIdsInOrder
                    : Array.from(selectedItems);
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    type: 'multiple-stacks',
                    stackIds: dragStackIds,
                    count: dragStackIds.length,
                  })
                );
              } else {
                // If dragging an unselected item, just drag that item
                dragStackIds = [item.id];
              }
            }

            setStackDragData(e.dataTransfer, dragStackIds);
            setExternalImageDragData(e.dataTransfer, sourceImageUrl, sourceImageFilename);

            // Chrome では dropEffect が copy の場合に effectAllowed に copy が含まれていないと
            // ドロップ自体がキャンセルされるため、copy/move の両方を許可する
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          onDragOver={(e) => {
            // Ignore file drags; let parent DropZone handle uploads
            if (e.dataTransfer?.types?.includes('Files') && !draggedStack?.stackId) return;
            if (!hasStackDragPayload(e.dataTransfer, draggedStack?.stackId)) {
              setIsDragOver(false);
              return;
            }
            setIsDragOver(true);
            e.preventDefault();
            try {
              e.dataTransfer.dropEffect = 'move';
            } catch {}
          }}
          onDragLeave={() => {
            setIsDragOver(false);
            console.log('Drag left for item:', item.id);
          }}
          onDrop={(e) => {
            console.log('onDrop', e.dataTransfer);
            // Ignore file drops here
            if (e.dataTransfer?.types?.includes('Files') && !draggedStack?.stackId) return;
            if (!hasStackDragPayload(e.dataTransfer, draggedStack?.stackId)) {
              setIsDragOver(false);
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);

            const sourceIdsFromDrag = extractStackIdsFromDragPayload(
              e.dataTransfer,
              draggedStack?.stackId
            );
            if (sourceIdsFromDrag.length === 0) return;

            try {
              const targetId =
                typeof getStackId() === 'string'
                  ? Number.parseInt(getStackId() as string, 10)
                  : (getStackId() as number);
              // Exclude drop onto itself
              const sourceIds = sourceIdsFromDrag.filter((id) => id !== targetId);
              if (sourceIds.length === 0) return;

              // Execute merge request
              void apiClient
                .mergeStacks(targetId, sourceIds)
                .then((resp) => {
                  console.log('✅ Merge completed', { targetId, sourceIds });
                  // Optimistically update any loaded pages to remove sources and update target
                  const pages = queryClient.getQueriesData(['stacks', 'page']);
                  for (const [key, data] of pages) {
                    if (!data || typeof data !== 'object') continue;
                    const typedData = data as { stacks?: MediaGridItem[] };
                    if (!Array.isArray(typedData.stacks)) continue;
                    const stacks = typedData.stacks;
                    const filtered = stacks.filter(
                      (s) =>
                        !sourceIds.includes(
                          typeof s.id === 'string' ? Number.parseInt(s.id, 10) : s.id
                        )
                    );
                    const targetIdx = filtered.findIndex(
                      (s) =>
                        (typeof s.id === 'string' ? Number.parseInt(s.id, 10) : s.id) === targetId
                    );
                    if (targetIdx >= 0 && resp?.stack) {
                      filtered[targetIdx] = { ...filtered[targetIdx], ...resp.stack };
                    }
                    queryClient.setQueryData(key, { ...typedData, stacks: filtered });
                  }
                  // Also update count cache down by number of removed sources
                  const counts = queryClient.getQueriesData(['stacks', 'count']);
                  for (const [key, data] of counts) {
                    if (!data || typeof data !== 'object') continue;
                    const typedData = data as { total?: number };
                    if (typeof typedData.total !== 'number') continue;
                    queryClient.setQueryData(key, {
                      ...typedData,
                      total: Math.max(0, typedData.total - sourceIds.length),
                    });
                  }

                  // Trigger background refetch to reconcile with server
                  void queryClient.invalidateQueries({ queryKey: ['stacks'] });
                  // Broadcast for containers that manage virtualized ranges
                  window.dispatchEvent(
                    new CustomEvent('stacks-merged', { detail: { targetId, sourceIds } })
                  );
                })
                .catch((err) => {
                  console.error('❌ Merge failed', err);
                  alert('スタックの結合に失敗しました');
                });
            } catch (err) {
              console.error('Drop handling error', err);
            }
          }}
          tabIndex={0}
          aria-label={`View item: ${item.name}`}
        >
          <img
            src={thumbnailUrl}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-200"
            loading="lazy"
            data-stack-drag-preview="true"
          />
          {isNativeDragReady && sourceImageUrl ? (
            <img
              src={sourceImageUrl}
              alt=""
              className="absolute inset-0 z-[5] h-full w-full object-cover opacity-0"
              draggable={true}
              data-native-image-drag="true"
              aria-hidden="true"
            />
          ) : null}

          {/* Black overlay on hover */}
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-200" />

          {/* Selection mode overlay and button */}
          {isSelectionMode && isSelected && (
            <div className="absolute inset-0 bg-black opacity-30 transition-opacity duration-200" />
          )}

          {isSelectionMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(item.id);
              }}
              className={`absolute top-2 right-2 p-1 rounded-full z-10 ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/80 text-gray-700 hover:bg-white transition-colors duration-200'
              }`}
            >
              {isSelected ? (
                <Check size={16} />
              ) : (
                <div className="w-4 h-4 border border-current rounded-full" />
              )}
            </button>
          )}

          {/* Favorite button (hidden in selection mode) */}
          {!isSelectionMode && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(item, e);
              }}
              className={`absolute bottom-2 left-2 p-1 rounded-full transition-all duration-200 z-10 ${
                currentFavorited
                  ? favoriteKind === 'asset'
                    ? 'bg-sky-500 text-white'
                    : 'bg-yellow-500 text-white'
                  : 'bg-white/80 text-gray-700 hover:bg-white'
              }`}
              disabled={isFavoritePending}
            >
              {favoriteKind === 'asset' ? (
                <Bookmark size={14} className={currentFavorited ? 'fill-current' : ''} />
              ) : (
                <Star size={16} className={currentFavorited ? 'fill-current' : ''} />
              )}
            </button>
          )}

          {/* Pages (asset count) badge — unify with Tags/Fav design */}
          {pageCount > 1 && (
            <div
              className={cn('absolute z-20', isSelectionMode ? 'top-2 left-2' : 'top-2 right-2')}
            >
              <div className="flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-full text-xs font-medium shadow-md">
                <Book size={12} />
                <span>{pageCount}</span>
              </div>
            </div>
          )}

          {/* Like count (hidden in selection mode) */}
          {!isSelectionMode && likeCount > 0 && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-like text-white px-2 py-1 rounded-full text-xs font-medium z-10">
              <Heart size={12} className="fill-current" />
              <span>{likeCount}</span>
            </div>
          )}
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Open */}
        <ContextMenuItem onClick={handleContextOpen}>Open</ContextMenuItem>
        <ContextMenuItem onClick={handleDownloadOriginals}>
          <Download className="w-4 h-4 mr-2" />
          Download
        </ContextMenuItem>
        <ContextMenuSeparator />

        {/* Info + non-destructive actions */}
        <ContextMenuItem
          onClick={() => {
            setSelectedItemId(item.id);
            setInfoOpen(true);
          }}
        >
          <Info className="w-4 h-4 mr-2" />
          Info
        </ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            const ds = datasetId || '1';
            const stackId = getStackId();
            const id = typeof stackId === 'string' ? Number.parseInt(stackId, 10) : stackId;
            await navigate({
              to: '/library/$datasetId/stacks/$stackId/similar',
              params: { datasetId: ds, stackId: String(id) },
            });
          }}
        >
          <GalleryVerticalEnd className="w-4 h-4 mr-2" />
          Find similar
        </ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            try {
              const sc = await ensureScratch();
              const stackId =
                typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
              await apiClient.addStackToCollection(sc.id, stackId);
              await queryClient.invalidateQueries({ queryKey: ['stacks'] });
              await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
              await queryClient.refetchQueries({ queryKey: ['library-counts', datasetId] });
            } catch (e) {
              console.error('Failed to add to Scratch', e);
            }
          }}
        >
          <NotebookText className="w-4 h-4 mr-2" />
          Add to Scratch
        </ContextMenuItem>
        {canMergeSelectedStacks && (
          <ContextMenuItem
            onClick={async () => {
              if (!selectedStackIdsInOrder || typeof onMergeStacks !== 'function') return;
              const [targetId, ...sourceIds] = selectedStackIdsInOrder;
              const confirmed = window.confirm(
                `選択順の先頭スタック #${targetId} に残り ${sourceIds.length} 件をマージします。実行しますか？`
              );
              if (!confirmed) return;
              await onMergeStacks();
            }}
          >
            <GitMerge className="w-4 h-4 mr-2" />
            Merge Stacks
          </ContextMenuItem>
        )}
        {(allowRemoveFromCollection || allowRemoveFromScratch) && <ContextMenuSeparator />}
        {allowRemoveFromCollection && (
          <ContextMenuItem
            onClick={async () => {
              try {
                await onRemoveFromCollection?.(item.id);
              } catch (e) {
                console.error('Failed to remove from collection', e);
              }
            }}
            className="text-red-600 focus:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Remove from Collection
          </ContextMenuItem>
        )}
        {allowRemoveFromScratch && (
          <ContextMenuItem
            onClick={async () => {
              try {
                await onRemoveFromScratch?.(item.id);
              } catch (e) {
                console.error('Failed to remove from scratch', e);
              }
            }}
            className="text-red-600 focus:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Remove from Scratch
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem className="text-red-600 focus:text-red-700" onClick={handleRemoveStack}>
          <Trash2 className="w-4 h-4 mr-2" />
          Remove Stack
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
