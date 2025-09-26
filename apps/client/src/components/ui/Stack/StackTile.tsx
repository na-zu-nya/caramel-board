import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {cn} from '@/lib/utils';
import {getThumbnailPath} from '@/utils/thumbnailPath';
import {Book, GalleryVerticalEnd, Heart, NotebookText, Star, Info} from 'lucide-react';
import {cloneElement, isValidElement} from 'react';

export interface StackTileProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  // Visual data
  thumbnailUrl?: string | null;
  title?: string;
  pageCount?: number;
  favorited?: boolean;
  likeCount?: number;
  // Actions
  onOpen?: () => void;
  onInfo?: () => void;
  onFindSimilar?: () => void;
  onAddToScratch?: () => void;
  onToggleFavorite?: () => void;
  onLike?: () => void;
  // Drag source props (from hook)
  dragHandlers?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

export function StackTile({
  asChild,
  thumbnailUrl,
  title,
  pageCount,
  favorited,
  likeCount,
  onOpen,
  onInfo,
  onFindSimilar,
  onAddToScratch,
  onToggleFavorite,
  onLike,
  dragHandlers,
  className,
  children,
  ...divProps
}: StackTileProps) {
  const body = (
    <div
      className={cn(
        'group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100',
        className
      )}
      {...dragHandlers}
      {...divProps}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl.startsWith('http') ? thumbnailUrl : getThumbnailPath(thumbnailUrl)}
          alt={title || 'stack'}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = '/no-image.png';
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50">
          No Image
        </div>
      )}

      {/* Page count (right-top) */}
      {pageCount && pageCount > 1 && (
        <div className="absolute top-2 right-2 z-10">
          <div className="flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-full text-xs font-medium">
            <Book size={12}/>
            <span>{pageCount}</span>
          </div>
        </div>
      )}

      {/* Favorite (left-bottom) */}
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
        aria-label={favorited ? 'Remove favorite' : 'Add favorite'}
      >
        <Star size={16} className={favorited ? 'fill-current' : ''}/>
      </button>

      {/* Like (right-bottom) - hide badge completely when count is 0 or undefined */}
      {typeof likeCount === 'number' && likeCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onLike?.();
          }}
          className="absolute bottom-2 right-2 flex items-center gap-1 bg-like text-white px-2 py-1 rounded-full text-xs font-medium z-10 hover:opacity-90"
          aria-label="Like"
        >
          <Heart size={12} className="fill-current"/>
          <span>{likeCount}</span>
        </button>
      )}
    </div>
  );

  const wrapped = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {asChild && isValidElement(children)
          ? cloneElement(children as any, {children: body})
          : body}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onOpen?.()}>Open</ContextMenuItem>
        <ContextMenuSeparator/>
        <ContextMenuItem onClick={() => onInfo?.()}>
          <Info className="w-4 h-4 mr-2" />
          Info
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onFindSimilar?.()}>
          <GalleryVerticalEnd className="w-4 h-4 mr-2"/>
          Find similar
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAddToScratch?.()}>
          <NotebookText className="w-4 h-4 mr-2"/>
          Add to Scratch
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  if (asChild && isValidElement(children)) return wrapped;
  return <div>{wrapped}</div>;
}
