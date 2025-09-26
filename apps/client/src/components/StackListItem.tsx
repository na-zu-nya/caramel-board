import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {useDrag} from '@/contexts/DragContext';
import {useScratch} from '@/hooks/useScratch';
import {apiClient} from '@/lib/api-client';
import {cn} from '@/lib/utils';
import {navigationStateAtom} from '@/stores/navigation';
import {infoSidebarOpenAtom, selectedItemIdAtom} from '@/stores/ui';
import type {Stack} from '@/types';
import {getThumbnailPath} from '@/utils/thumbnailPath';
import {useQueryClient} from '@tanstack/react-query';
import {Link, useNavigate} from '@tanstack/react-router';
import {useAtom, useSetAtom} from 'jotai';
import {Book, Check, GalleryVerticalEnd, Heart, Image, NotebookText, Star, Trash2, Info} from 'lucide-react';

export type StackItemVariant = 'thumbnail' | 'with-title' | 'with-description';

interface StackItemProps {
  stack: Stack;
  datasetId: string;
  variant?: StackItemVariant;
  showLikeCount?: boolean;
  showFavorited?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelection?: (stackId: string | number) => void;
  onClick?: (stack: Stack, event: React.MouseEvent) => void;
  className?: string;
  selectedItemsSet?: Set<string | number>;
}

export function StackListItem({
  stack,
  datasetId,
  variant = 'thumbnail',
  showLikeCount = true,
  showFavorited = false,
  selectable = false,
  selected = false,
  onToggleSelection,
  onClick,
  className = '',
}: StackItemProps) {
  const likeCount = stack.likeCount || stack.liked || 0;
  const isFavorited = stack.favorited || stack.isFavorite || false;
  const {setIsDragging} = useDrag();
  const [, setNavigationState] = useAtom(navigationStateAtom);

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && e.target instanceof HTMLButtonElement) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 共通: ナビゲーション前に現在のスクロール位置を保存（一覧復帰用）
    try {
      setNavigationState({
        scrollPosition: window.scrollY,
        total: 0,
        items: [],
        lastPath: window.location.pathname,
      });
    } catch {
    }

    if (onClick) {
      e.preventDefault();
      onClick(stack, e);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleSelection) {
      onToggleSelection(stack.id);
    }
  };

  // If onClick is provided, render as div, otherwise as Link
  const WrapperComponent = onClick ? 'div' : Link;
  const wrapperProps = onClick
    ? {
      className: cn('group cursor-pointer block', className),
      onClick: handleClick,
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        try {
          setIsDragging(true);
          const id = typeof stack.id === 'string' ? stack.id : String(stack.id);
          // If multiple items are selected and this item is among them, drag all
          const selectedIds =
            selectedItemsSet && selectedItemsSet.size > 0 && selectedItemsSet.has(stack.id)
              ? Array.from(selectedItemsSet)
              : [];
          if (selectedIds.length > 1) {
            e.dataTransfer.setData('text/plain', `stack-items:${selectedIds.join(',')}`);
          } else {
            e.dataTransfer.setData('text/plain', `stack-item:${id}`);
          }
          e.dataTransfer.effectAllowed = 'copyMove';
        } catch {
        }
      },
      onDragEnd: () => setIsDragging(false),
    }
    : {
      to: '/library/$datasetId/stacks/$stackId',
      params: {datasetId, stackId: String(stack.id)},
      className: cn('group cursor-pointer block', className),
      onClick: handleClick,
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        try {
          setIsDragging(true);
          const id = typeof stack.id === 'string' ? stack.id : String(stack.id);
          const selectedIds =
            selectedItemsSet && selectedItemsSet.size > 0 && selectedItemsSet.has(stack.id)
              ? Array.from(selectedItemsSet)
              : [];
          if (selectedIds.length > 1) {
            e.dataTransfer.setData('text/plain', `stack-items:${selectedIds.join(',')}`);
          } else {
            e.dataTransfer.setData('text/plain', `stack-item:${id}`);
          }
          e.dataTransfer.effectAllowed = 'copyMove';
        } catch {
        }
      },
      onDragEnd: () => setIsDragging(false),
    };

  const queryClient = useQueryClient();
  const inCollectionPath =
    typeof window !== 'undefined' && window.location.pathname.includes('/collections/');
  const inScratchPath =
    typeof window !== 'undefined' && window.location.pathname.includes('/scratch/');
  const isManualCollection =
    typeof document !== 'undefined' && document.body.dataset.collectionType === 'MANUAL';
  const navigate = useNavigate();
  const setInfoOpen = useSetAtom(infoSidebarOpenAtom);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const {ensureScratch} = useScratch(datasetId);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <WrapperComponent {...wrapperProps}>
          <div
            className={cn(
              'aspect-square relative overflow-hidden rounded-lg bg-gray-100 mb-2 border border-gray-200 group-hover:border-gray-300 transition-all',
              selected && 'ring-2 ring-blue-500'
            )}
          >
            {stack.thumbnail ? (
              <img
                src={getThumbnailPath(stack.thumbnail)}
                alt={stack.title || stack.name || 'Stack'}
                className={cn(
                  'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300',
                  selected && 'opacity-75'
                )}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '/no-image.png';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50">
                <Image size={40} className="opacity-20"/>
              </div>
            )}

            {/* Selection overlay */}
            {selectable && selected && (
              <div className="absolute inset-0 bg-black opacity-30 transition-opacity duration-200"/>
            )}

            {/* Selection checkbox */}
            {selectable && (
              <button
                type="button"
                onClick={handleCheckboxClick}
                className={cn(
                  'absolute top-2 right-2 p-1 rounded-full z-10',
                  selected
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/80 text-gray-700 hover:bg-white transition-colors duration-200'
                )}
              >
                {selected ? (
                  <Check size={16}/>
                ) : (
                  <div className="w-4 h-4 border border-current rounded-full"/>
                )}
              </button>
            )}

            {/* Pages (asset count) badge — style consistent with Like/Fav */}
            {stack.assetsCount > 1 && (
              <div className={cn('absolute', selectable ? 'top-2 left-2' : 'top-2 right-2')}>
                <div
                  className="flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-full text-xs font-medium shadow-md">
                  <Book size={12}/>
                  <span>{stack.assetsCount}</span>
                </div>
              </div>
            )}

            {/* Favorite star */}
            {showFavorited && isFavorited && (
              <div className="absolute bottom-2 left-2 p-1 rounded-full bg-yellow-500 text-white">
                <Star size={16} className="fill-current"/>
              </div>
            )}

            {/* Like count badge */}
            {showLikeCount && likeCount > 0 && (
              <div
                className="absolute bottom-2 right-2 flex items-center gap-1 bg-like text-white px-2 py-1 rounded-full text-xs font-medium shadow-md">
                <Heart size={12} className="fill-current"/>
                <span>{likeCount}</span>
              </div>
            )}
          </div>

          {/* Title and description based on variant */}
          {variant !== 'thumbnail' && (
            <div className="px-1">
              {(variant === 'with-title' || variant === 'with-description') && (
                <h3 className="font-medium text-sm truncate group-hover:text-blue-600 transition-colors">
                  {stack.title || stack.name || 'Untitled'}
                </h3>
              )}

              {variant === 'with-description' && stack.description && (
                <p className="text-xs text-gray-500 truncate">{stack.description}</p>
              )}
            </div>
          )}
        </WrapperComponent>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Open */}
        <ContextMenuItem
          onClick={async () => {
            const id = typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : stack.id;
            await navigate({
              to: '/library/$datasetId/stacks/$stackId',
              params: {datasetId, stackId: String(id)},
            });
          }}
        >
          Open
        </ContextMenuItem>
        <ContextMenuSeparator/>

        {/* Info + non-destructive actions */}
        <ContextMenuItem
          onClick={() => {
            setSelectedItemId(stack.id);
            setInfoOpen(true);
          }}
        >
          <Info className="w-4 h-4 mr-2"/>
          Info
        </ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            const id = typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : stack.id;
            await navigate({
              to: '/library/$datasetId/stacks/$stackId/similar',
              params: {datasetId, stackId: String(id)},
            });
          }}
        >
          <GalleryVerticalEnd className="w-4 h-4 mr-2"/>
          Find similar
        </ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            try {
              const sc = await ensureScratch();
              const id = typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : stack.id;
              await apiClient.addStackToCollection(sc.id, id);
              await queryClient.invalidateQueries({queryKey: ['stacks']});
              await queryClient.invalidateQueries({queryKey: ['library-counts', datasetId]});
              await queryClient.refetchQueries({queryKey: ['library-counts', datasetId]});
            } catch (e) {
              console.error('Failed to add to Scratch', e);
            }
          }}
        >
          <NotebookText className="w-4 h-4 mr-2"/>
          Add to Scratch
        </ContextMenuItem>
        {(inCollectionPath && isManualCollection) || inScratchPath ? (
          <ContextMenuSeparator/>
        ) : null}
        {inCollectionPath && isManualCollection && (
          <ContextMenuItem
            className="text-red-600 focus:text-red-700"
            onClick={async () => {
              try {
                const collectionId =
                  document?.body?.dataset?.collectionId ||
                  (window.location.pathname.match(/collections\/(\d+)/)?.[1] ?? '');
                if (!collectionId) return;
                const id = typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : stack.id;
                await apiClient.removeStackFromCollection(collectionId, id);
                await queryClient.invalidateQueries({queryKey: ['stacks']});
                await queryClient.invalidateQueries({queryKey: ['collection-folders']});
              } catch (e) {
                console.error('Failed to remove from collection', e);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2"/>
            Remove from Collection
          </ContextMenuItem>
        )}
        {inScratchPath && (
          <ContextMenuItem
            className="text-red-600 focus:text-red-700"
            onClick={async () => {
              try {
                const scratchId =
                  document?.body?.dataset?.collectionId ||
                  (window.location.pathname.match(/scratch\/(\d+)/)?.[1] ?? '');
                if (!scratchId) return;
                const id = typeof stack.id === 'string' ? Number.parseInt(stack.id, 10) : stack.id;
                await apiClient.removeStackFromCollection(scratchId, id);
                await queryClient.invalidateQueries({queryKey: ['stacks']});
              } catch (e) {
                console.error('Failed to remove from scratch', e);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2"/>
            Remove from Scratch
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
