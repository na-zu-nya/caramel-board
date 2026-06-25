import { Bookmark, Columns2, Heart, Layers, Square, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ComicDisplayMode, Stack } from '@/types';

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
  displayMode?: ComicDisplayMode;
  onDisplayModeToggle?: () => void;
  leadingAction?: ReactNode;
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
  displayMode = 'single',
  onDisplayModeToggle,
  leadingAction,
}: StackToolbarProps) {
  const t = useT();
  const canBookmarkPage =
    stack.assets.length > 1 || stack.assetCount > 1 || (stack.assetsCount ?? 0) > 1;

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 z-50 flex items-end justify-between gap-4 transition-opacity',
        isGesturing ? 'opacity-0' : 'opacity-100'
      )}
    >
      {leadingAction && <div className="pointer-events-auto flex shrink-0">{leadingAction}</div>}

      <div className="pointer-events-auto ml-auto flex items-center justify-end gap-2">
        <button
          onClick={onStackFavoriteToggle}
          className={cn(
            'p-3 rounded-full transition-colors',
            stack.favorited
              ? 'bg-yellow-500 text-white'
              : 'bg-black/40 text-white hover:bg-black/60 hover:text-primary'
          )}
          aria-label={
            stack.favorited
              ? t.viewerControls.removeStackFromFavorites
              : t.viewerControls.addStackToFavorites
          }
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
              isCurrentAssetFavorited
                ? t.viewerControls.removePageBookmark
                : t.viewerControls.bookmarkPage
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
          aria-label={(stack.liked ?? 0) > 0 ? t.viewerControls.unlike : t.viewerControls.like}
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
          aria-label={isListMode ? t.viewerControls.exitListMode : t.viewerControls.enterListMode}
        >
          <Layers size={20} />
        </button>

        {onDisplayModeToggle && (
          <button
            onClick={onDisplayModeToggle}
            className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3.5 py-3 text-sm font-medium text-white transition-colors hover:bg-black/60 hover:text-primary"
            aria-label={
              displayMode === 'spread'
                ? t.viewerControls.singlePageDisplay
                : t.viewerControls.spreadDisplay
            }
          >
            {displayMode === 'spread' ? <Columns2 size={18} /> : <Square size={18} />}
            <span>
              {displayMode === 'spread'
                ? t.viewerControls.spreadDisplayShort
                : t.viewerControls.singlePageDisplayShort}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
