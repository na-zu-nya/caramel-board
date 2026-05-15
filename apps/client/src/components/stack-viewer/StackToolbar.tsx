import { Bookmark, Heart, Layers, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Stack } from '@/types';

export type AssetSortPreset = 'filename-asc' | 'filename-desc' | 'created-asc' | 'created-desc';

interface StackToolbarProps {
  stack: Stack;
  isListMode: boolean;
  isGesturing: boolean;
  isCurrentAssetFavorited?: boolean;
  onStackFavoriteToggle: () => void;
  onAssetFavoriteToggle: () => void;
  onLikeToggle: () => void;
  onListModeToggle: () => void;
}

export default function StackToolbar({
  stack,
  isListMode,
  isGesturing,
  isCurrentAssetFavorited = false,
  onStackFavoriteToggle,
  onAssetFavoriteToggle,
  onLikeToggle,
  onListModeToggle,
}: StackToolbarProps) {
  const canBookmarkPage = stack.assets.length > 1 || stack.assetCount > 1 || stack.assetsCount > 1;

  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 flex gap-2 transition-opacity z-50 pointer-events-auto',
        isGesturing ? 'opacity-0' : 'opacity-100'
      )}
    >
      <button
        onClick={onStackFavoriteToggle}
        className={cn(
          'p-3 rounded-full transition-colors',
          stack.favorited
            ? 'bg-yellow-500 text-white'
            : 'bg-black/40 text-white hover:bg-black/60 hover:text-primary'
        )}
        aria-label={stack.favorited ? 'Remove stack from favorites' : 'Add stack to favorites'}
      >
        <Star size={20} className={stack.favorited ? 'fill-current' : ''} />
      </button>

      {canBookmarkPage && (
        <button
          onClick={onAssetFavoriteToggle}
          className={cn(
            'p-3 rounded-full transition-colors',
            isCurrentAssetFavorited
              ? 'bg-sky-500 text-white'
              : 'bg-black/40 text-white hover:bg-black/60 hover:text-sky-300'
          )}
          aria-label={
            isCurrentAssetFavorited ? 'Remove current page bookmark' : 'Bookmark current page'
          }
        >
          <Bookmark size={20} className={isCurrentAssetFavorited ? 'fill-current' : ''} />
        </button>
      )}

      <button
        onClick={onLikeToggle}
        className={cn(
          'p-3 rounded-full transition-colors flex items-center gap-1',
          (stack.liked ?? 0) > 0
            ? 'bg-like text-white'
            : 'bg-black/40 text-white hover:bg-black/60 hover:text-primary'
        )}
        aria-label={(stack.liked ?? 0) > 0 ? 'Unlike' : 'Like'}
      >
        <Heart size={20} className={(stack.liked ?? 0) > 0 ? 'fill-current' : ''} />
        {(stack.liked ?? 0) > 0 && <span className="text-sm">{stack.liked}</span>}
      </button>

      <button
        onClick={onListModeToggle}
        className={cn(
          'p-3 rounded-full transition-colors',
          isListMode
            ? 'bg-blue-500 text-white'
            : 'bg-black/40 text-white hover:bg-black/60 hover:text-primary'
        )}
        aria-label={isListMode ? 'Exit list mode' : 'Enter list mode'}
      >
        <Layers size={20} />
      </button>
    </div>
  );
}
