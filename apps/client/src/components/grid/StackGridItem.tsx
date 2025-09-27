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
import { cn } from '@/lib/utils';
import { currentFilterAtom, infoSidebarOpenAtom, selectedItemIdAtom } from '@/stores/ui';
import type { MediaGridItem } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAtom, useSetAtom } from 'jotai';
import {
  Book,
  Check,
  GalleryVerticalEnd,
  Heart,
  NotebookText,
  Star,
  Trash2,
  Info,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  allowRemoveFromCollection = false,
  onRemoveFromCollection,
  allowRemoveFromScratch = false,
  onRemoveFromScratch,
}: StackGridItemProps) {
  const currentFavorited = overrideFavorited ?? item.favorited ?? item.isFavorite ?? false;
  const thumbnailUrl = item.thumbnail || item.thumbnailUrl || '/no-image.png';
  const likeCount = Number((item as any).likeCount ?? (item as any).liked ?? 0);
  const pageCount = (item as any).assetCount ?? (item as any)._count?.assets ?? 0;
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { setIsDragging: setGlobalDragging } = useDrag();
  const [filter] = useAtom(currentFilterAtom);
  const datasetId = (filter?.datasetId as string) || '1';
  const { ensureScratch } = useScratch(datasetId);
  const navigate = useNavigate();
  const setInfoOpen = useSetAtom(infoSidebarOpenAtom);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);

  // Fade-in animation state
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenSeen, setHasBeenSeen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={itemRef}
          key={item.id}
          data-item-id={item.id}
          className={cn(
            'group relative aspect-square overflow-hidden cursor-pointer transition-transform duration-150 box-border',
            isInfoSelected && 'ring-2 ring-primary ring-inset',
            isVisible ? 'opacity-100' : 'opacity-0',
            isDragging ? 'border-8 border-gray-300 scale-95 opacity-50 rounded-lg' : '',
            isDragOver && 'border-8 border-accent'
          )}
          onClick={(e) => onItemClick(item, e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onItemClick(item);
            }
          }}
          onDragEnd={() => {
            console.log('Drag ended for item:', item.id);
            setIsDragging(false);
            setGlobalDragging(false);
          }}
          onDragStart={(e) => {
            console.log('Drag started for item:', item.id);
            setIsDragging(true);
            setGlobalDragging(true);

            // Check if this item is part of a selection
            if (isSelectionMode && selectedItems.size > 0) {
              // If the dragged item is selected, drag all selected items
              if (selectedItems.has(item.id)) {
                const selectedIds = Array.from(selectedItems);
                e.dataTransfer.setData('text/plain', `stack-items:${selectedIds.join(',')}`);
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    type: 'multiple-stacks',
                    stackIds: selectedIds,
                    count: selectedIds.length,
                  })
                );
              } else {
                // If dragging an unselected item, just drag that item
                e.dataTransfer.setData('text/plain', `stack-item:${item.id}`);
              }
            } else {
              // Not in selection mode, just drag single item
              e.dataTransfer.setData('text/plain', `stack-item:${item.id}`);
            }

            // Chrome では dropEffect が copy の場合に effectAllowed に copy が含まれていないと
            // ドロップ自体がキャンセルされるため、copy/move の両方を許可する
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          onDragOver={(e) => {
            // Ignore file drags; let parent DropZone handle uploads
            if (e.dataTransfer?.types?.includes('Files')) return;
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
            if (e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);

            const text = e.dataTransfer.getData('text/plain');
            if (!text) return;

            try {
              const targetId =
                typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
              let sourceIds: number[] = [];

              if (text.startsWith('stack-item:')) {
                const idStr = text.replace('stack-item:', '').trim();
                const idNum = Number.parseInt(idStr, 10);
                if (!Number.isNaN(idNum)) sourceIds = [idNum];
              } else if (text.startsWith('stack-items:')) {
                const idList = text.replace('stack-items:', '').trim();
                sourceIds = idList
                  .split(',')
                  .map((s) => Number.parseInt(s.trim(), 10))
                  .filter((n) => !Number.isNaN(n));
              }

              // Exclude drop onto itself
              sourceIds = sourceIds.filter((id) => id !== targetId);
              if (sourceIds.length === 0) return;

              // Execute merge request
              void apiClient
                .mergeStacks(targetId, sourceIds)
                .then((resp) => {
                  console.log('✅ Merge completed', { targetId, sourceIds });
                  // Optimistically update any loaded pages to remove sources and update target
                  const pages = queryClient.getQueriesData<any>(['stacks', 'page']);
                  for (const [key, data] of pages) {
                    if (!data?.stacks) continue;
                    const stacks = data.stacks as any[];
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
                    queryClient.setQueryData(key as any, { ...data, stacks: filtered });
                  }
                  // Also update count cache down by number of removed sources
                  const counts = queryClient.getQueriesData<any>(['stacks', 'count']);
                  for (const [key, data] of counts) {
                    if (!data?.total) continue;
                    queryClient.setQueryData(key as any, {
                      ...data,
                      total: Math.max(0, (data.total as number) - sourceIds.length),
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
          draggable={true}
          tabIndex={0}
          role="button"
          aria-label={`View item: ${item.name}`}
        >
          <img
            src={thumbnailUrl}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-200"
            loading="lazy"
          />

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
              onClick={(e) => onToggleFavorite(item, e)}
              className={`absolute bottom-2 left-2 p-1 rounded-full transition-all duration-200 z-10 ${
                currentFavorited
                  ? 'bg-yellow-500 text-white'
                  : 'bg-white/80 text-gray-700 hover:bg-white'
              }`}
              disabled={isFavoritePending}
            >
              <Star size={16} className={currentFavorited ? 'fill-current' : ''} />
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
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Open */}
        <ContextMenuItem
          onClick={async () => {
            const ds = datasetId || '1';
            const id =
              typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
            await navigate({
              to: '/library/$datasetId/stacks/$stackId',
              params: { datasetId: ds, stackId: String(id) },
            });
          }}
        >
          Open
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
            const id =
              typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
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
      </ContextMenuContent>
    </ContextMenu>
  );
}
