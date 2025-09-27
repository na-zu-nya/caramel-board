import { Loader2 } from 'lucide-react';
import type { MediaGridItem } from '@/types';
import { DebugOverlay } from './DebugOverlay';
import { GridItem } from './GridItem';

interface VirtualScrollContentProps {
  totalContentHeight: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  columnsPerRow: number;
  visibleItems: MediaGridItem[];
  anchorItemId?: string | number | null;
  anchorDebugInfo: {
    anchorInVisible: boolean;
    anchorFound: boolean;
  };
  selectedItems: Set<string | number>;
  selectedItemId?: string | number | null;
  infoSidebarOpen: boolean;
  isSelectionMode: boolean;
  isFavoritePending: boolean;
  isLoading: boolean;
  hasMore: boolean;
  onItemClick: (item: MediaGridItem) => void;
  onToggleSelection: (itemId: string | number) => void;
  onToggleFavorite: (item: MediaGridItem, event: React.MouseEvent) => void;
}

export function VirtualScrollContent({
  totalContentHeight,
  topSpacerHeight,
  bottomSpacerHeight,
  columnsPerRow,
  visibleItems,
  anchorItemId,
  anchorDebugInfo,
  selectedItems,
  selectedItemId,
  infoSidebarOpen,
  isSelectionMode,
  isFavoritePending,
  isLoading,
  hasMore,
  onItemClick,
  onToggleSelection,
  onToggleFavorite,
}: VirtualScrollContentProps) {
  return (
    <div
      style={{
        paddingTop: '3.5rem',
        minHeight: totalContentHeight + 56,
      }}
    >
      {/* Top spacer */}
      {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

      {/* Visible items grid */}
      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
        }}
      >
        {/* Debug overlay */}
        <DebugOverlay
          anchorItemId={anchorItemId}
          visibleItems={visibleItems}
          anchorDebugInfo={anchorDebugInfo}
        />

        {/* Grid items */}
        {visibleItems.map((item) => {
          const isSelected = selectedItems.has(item.id);
          const isInfoSelected = infoSidebarOpen && selectedItemId === item.id;
          const isAnchorItem = anchorItemId === item.id;

          return (
            <GridItem
              key={item.id}
              item={item}
              isSelected={isSelected}
              isInfoSelected={isInfoSelected}
              isAnchorItem={isAnchorItem}
              isSelectionMode={isSelectionMode}
              isFavoritePending={isFavoritePending}
              onItemClick={onItemClick}
              onToggleSelection={onToggleSelection}
              onToggleFavorite={onToggleFavorite}
            />
          );
        })}
      </div>

      {/* Bottom spacer */}
      {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}

      {/* Loading indicator */}
      {isLoading && hasMore && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}
    </div>
  );
}
