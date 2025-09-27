import { cn } from '@/lib/utils';
import type { Stack } from '@/types';
import { ArrowUpDown, Heart, Layers, Star } from 'lucide-react';

interface StackToolbarProps {
  stack: Stack;
  isListMode: boolean;
  isGesturing: boolean;
  onFavoriteToggle: () => void;
  onLikeToggle: () => void;
  onListModeToggle: () => void;
  // Optional: show reorder button when list mode
  onReorderToggle?: () => void;
  isReorderMode?: boolean;
}

export default function StackToolbar({
  stack,
  isListMode,
  isGesturing,
  onFavoriteToggle,
  onLikeToggle,
  onListModeToggle,
  onReorderToggle,
  isReorderMode,
}: StackToolbarProps) {
  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 flex gap-2 transition-opacity z-50 pointer-events-auto',
        isGesturing ? 'opacity-0' : 'opacity-100'
      )}
    >
      <button
        onClick={onFavoriteToggle}
        className={cn(
          'p-3 rounded-full transition-colors',
          stack.favorited
            ? 'bg-yellow-500 text-white'
            : 'bg-black/40 text-white hover:bg-black/60 hover:text-primary'
        )}
        aria-label={stack.favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={20} className={stack.favorited ? 'fill-current' : ''} />
      </button>

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

      {isListMode && onReorderToggle && (
        <button
          onClick={onReorderToggle}
          className={cn(
            'p-3 rounded-full transition-colors',
            isReorderMode
              ? 'bg-green-500 text-white'
              : 'bg-black/40 text-white hover:bg-black/60 hover:text-primary'
          )}
          aria-label={isReorderMode ? 'Exit reorder mode' : 'Enter reorder mode'}
        >
          <ArrowUpDown size={20} />
        </button>
      )}
    </div>
  );
}
