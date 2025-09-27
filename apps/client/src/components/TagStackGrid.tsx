import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { applyScrollbarCompensation, removeScrollbarCompensation } from '@/lib/scrollbar-utils';
import { cn } from '@/lib/utils';
import type { MediaGridItem } from '@/types';

interface TagStackGridProps {
  items: MediaGridItem[];
  isLoading?: boolean;
  hasMore?: boolean;
  className?: string;
}

export default function TagStackGrid({
  items,
  isLoading = false,
  hasMore = false,
  className,
}: TagStackGridProps) {
  // While this grid is mounted, stabilize body scrollbar gutter for contextmenu reflows
  useEffect(() => {
    applyScrollbarCompensation();
    return () => {
      removeScrollbarCompensation();
    };
  }, []);

  if (!items || items.length === 0) {
    return <div className="text-center py-16 text-muted-foreground">No stacks found</div>;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {items.map((item) => (
          <Link
            key={item.id}
            to="/library/$datasetId/stacks/$stackId"
            params={(): { datasetId: string; stackId: string } => ({
              datasetId: String(item.dataSetId),
              stackId: String(item.id),
            })}
            className="group relative aspect-square overflow-hidden cursor-pointer transition-all duration-200"
          >
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt={item.name || 'Stack'}
                className="w-full h-full object-cover transition-transform duration-200"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}

            {/* Black overlay on hover */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-200" />
          </Link>
        ))}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading more...
          </div>
        </div>
      )}

      {/* Has more indicator */}
      {!isLoading && hasMore && (
        <div className="text-center py-4 text-sm text-muted-foreground">Scroll to load more</div>
      )}
    </div>
  );
}
