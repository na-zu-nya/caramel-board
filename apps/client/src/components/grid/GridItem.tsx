import { Check, Heart, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MediaGridItem } from '@/types';

interface GridItemProps {
  item?: MediaGridItem; // Made optional to handle undefined items
  isSelected: boolean;
  isInfoSelected: boolean;
  isAnchorItem: boolean;
  isSelectionMode: boolean;
  isFavoritePending: boolean;
  onItemClick: (item: MediaGridItem) => void;
  onToggleSelection: (itemId: string | number) => void;
  onToggleFavorite: (item: MediaGridItem, event: React.MouseEvent) => void;
}

export function GridItem({
  item,
  isSelected,
  isInfoSelected,
  isAnchorItem,
  isSelectionMode,
  isFavoritePending,
  onItemClick,
  onToggleSelection,
  onToggleFavorite,
}: GridItemProps) {
  // Fade-in animation state
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenSeen, setHasBeenSeen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for fade-in animation
  useEffect(() => {
    const element = itemRef.current;
    if (!element || hasBeenSeen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasBeenSeen) {
            setIsVisible(true);
            setHasBeenSeen(true);
            observer.unobserve(element);
          }
        });
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

  // Handle undefined items (skeleton state)
  if (!item) {
    return (
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse">
        <div className="absolute inset-2 bg-gray-200 dark:bg-gray-700 rounded-md" />
      </div>
    );
  }

  const resolveBoolean = (value: unknown, fallback = false) =>
    typeof value === 'boolean' ? value : fallback;

  const resolveNumeric = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const currentFavorited = resolveBoolean(item.favorited ?? item.isFavorite, false);
  const thumbnailUrl = item.thumbnail || item.thumbnailUrl || '/no-image.png';
  const likeCount =
    resolveNumeric(item.likeCount) ?? resolveNumeric(item.liked) ?? resolveNumeric(item.likes) ?? 0;

  // Debug log for anchor item
  if (isAnchorItem) {
    console.log('🎯 Rendering anchor item:', {
      itemId: item.id,
      isAnchorItem,
    });
  }

  return (
    <div
      ref={itemRef}
      key={item.id}
      data-item-id={item.id}
      className={cn(
        'group relative aspect-square overflow-hidden cursor-pointer transition-opacity duration-150',
        isInfoSelected && 'ring-2 ring-blue-500 ring-inset',
        isAnchorItem && 'ring-4 ring-red-600',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        ...(isAnchorItem && {
          border: '4px solid #dc2626',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 10,
        }),
      }}
      onClick={() => onItemClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onItemClick(item);
        }
      }}
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

      {/* White overlay on hover */}
      {!isSelectionMode && (
        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
      )}

      {/* Selection overlay */}
      {isSelectionMode && isSelected && (
        <div className="absolute inset-0 bg-black opacity-30 transition-opacity duration-200" />
      )}

      {/* Selection checkbox */}
      {isSelectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(item.id);
          }}
          className={`absolute top-2 right-2 p-1 rounded-full z-10 ${
            isSelected
              ? 'bg-blue-500 text-white'
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

      {/* Debug: Anchor item indicator */}
      {isAnchorItem && (
        <div className="absolute top-0 left-0 bg-red-600 text-white text-sm font-bold px-2 py-1 z-30 border-2 border-white">
          ANCHOR
        </div>
      )}

      {/* Favorite button */}
      <button
        type="button"
        onClick={(e) => onToggleFavorite(item, e)}
        className={`absolute bottom-2 left-2 p-1 rounded-full transition-all duration-200 z-10 ${
          currentFavorited ? 'bg-yellow-500 text-white' : 'bg-white/80 text-gray-700 hover:bg-white'
        }`}
        disabled={isFavoritePending}
      >
        <Star size={16} className={currentFavorited ? 'fill-current' : ''} />
      </button>

      {/* Like count */}
      {likeCount > 0 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-like text-white px-2 py-1 rounded-full text-xs font-medium z-10">
          <Heart size={12} className="fill-current" />
          <span>{likeCount}</span>
        </div>
      )}
    </div>
  );
}
