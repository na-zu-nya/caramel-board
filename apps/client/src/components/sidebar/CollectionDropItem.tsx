import { useLocation, useNavigate } from '@tanstack/react-router';
import { BookText, Settings } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { CollectionContextMenu } from '@/components/modals/CollectionContextMenu';
import { CountBadge } from '@/components/ui/SideMenu/CountBadge';
import { useSidebarDrop } from '@/hooks/useSidebarDrop';
import { useTouchDropZone } from '@/hooks/useTouchDragDrop';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Collection } from '@/types';

const toPositiveInteger = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const hasStackId = (value: unknown): value is { stackId?: unknown } =>
  typeof value === 'object' && value !== null && 'stackId' in value;

const extractStackIdsFromDragData = (dragData: unknown): number[] => {
  if (!dragData) return [];

  if (typeof dragData === 'number' || typeof dragData === 'string') {
    const id = toPositiveInteger(dragData);
    return id ? [id] : [];
  }

  if (Array.isArray(dragData)) {
    return dragData
      .map((value) => (hasStackId(value) ? value.stackId : value))
      .map(toPositiveInteger)
      .filter((id): id is number => id !== null);
  }

  if (typeof dragData === 'object') {
    const payload = dragData as {
      stackIds?: Array<unknown>;
      items?: Array<unknown>;
      stackId?: unknown;
    };

    if (Array.isArray(payload.stackIds)) {
      return payload.stackIds.map(toPositiveInteger).filter((id): id is number => id !== null);
    }

    if (Array.isArray(payload.items)) {
      return payload.items
        .map((item) => toPositiveInteger(hasStackId(item) ? item.stackId : item))
        .filter((id): id is number => id !== null);
    }

    if (typeof payload.stackId !== 'undefined') {
      const id = toPositiveInteger(payload.stackId);
      return id ? [id] : [];
    }
  }

  return [];
};

interface CollectionDropItemProps {
  datasetId: string;
  collection: Collection;
  isPinned: boolean;
  onUpdate: () => void;
  onDelete: () => void;
  onPin: (iconName: string) => void;
  onUnpin: () => void;
  onStackAdded: () => void;
  level?: number;
}

function CollectionDropItemComponent({
  datasetId,
  collection,
  isPinned,
  onUpdate,
  onDelete,
  onPin,
  onUnpin,
  onStackAdded,
  level = 0,
}: CollectionDropItemProps) {
  const dropElementRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  const addStacksToCollection = useCallback(
    async (stackIds: number[]) => {
      if (collection.type !== 'MANUAL') {
        return;
      }

      const uniqueIds = Array.from(
        new Set(stackIds.filter((id) => Number.isInteger(id) && id > 0))
      );
      if (uniqueIds.length === 0) {
        return;
      }

      try {
        if (uniqueIds.length === 1) {
          await apiClient.addStackToCollection(collection.id, uniqueIds[0]);
          onStackAdded();
          return;
        }

        try {
          await apiClient.bulkAddStacksToCollection(collection.id, uniqueIds);
          onStackAdded();
        } catch (bulkError) {
          console.warn('⚠️ Bulk add failed, falling back to individual adds', bulkError);
          let successCount = 0;

          for (const id of uniqueIds) {
            try {
              await apiClient.addStackToCollection(collection.id, id);
              successCount++;
            } catch (err) {
              if (!(err instanceof Error) || !err.message?.toLowerCase().includes('already')) {
                console.error(`❌ Failed to add stack ${id}:`, err);
              }
            }
          }

          if (successCount > 0) {
            onStackAdded();
          }
        }
      } catch (error) {
        console.error('❌ Failed to add stack(s) to collection:', error);
      }
    },
    [collection.id, collection.type, onStackAdded]
  );

  const handleDropLogic = useCallback(
    async (dragData: unknown) => {
      const stackIds = extractStackIdsFromDragData(dragData);
      await addStacksToCollection(stackIds);
    },
    [addStacksToCollection]
  );

  const { containerProps, showDropIndicator } = useSidebarDrop({
    acceptDrop: collection.type === 'MANUAL',
    onDrop: addStacksToCollection,
  });

  const { isDragOver: isTouchDragOver, setupDropZone } = useTouchDropZone({
    canDrop: (dragData) => {
      const ids = extractStackIdsFromDragData(dragData);
      return collection.type === 'MANUAL' && ids.length > 0;
    },
    onDrop: handleDropLogic,
  });

  useEffect(() => {
    const cleanup = setupDropZone(dropElementRef.current);
    return cleanup;
  }, [setupDropZone]);

  const isCurrentlyDragOver = useMemo(
    () => showDropIndicator || isTouchDragOver,
    [showDropIndicator, isTouchDragOver]
  );

  const isActive = pathname.includes(`/library/${datasetId}/collections/${collection.id}`);

  const handleCollectionClick = useCallback(() => {
    navigate({
      to: '/library/$datasetId/collections/$collectionId',
      params: {
        datasetId: String(datasetId),
        collectionId: String(collection.id),
      },
    });
  }, [collection.id, datasetId, navigate]);

  const handleFindSimilar = useCallback(() => {
    navigate({
      to: '/library/$datasetId/collections/$collectionId/similar',
      params: {
        datasetId: String(datasetId),
        collectionId: String(collection.id),
      },
    });
  }, [collection.id, datasetId, navigate]);

  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    dropElementRef.current = node;
  }, []);

  return (
    <CollectionContextMenu
      collection={collection}
      onUpdate={onUpdate}
      onDelete={onDelete}
      isPinned={isPinned}
      onPin={onPin}
      onUnpin={onUnpin}
      onOpen={handleCollectionClick}
      onFindSimilar={handleFindSimilar}
    >
      <div
        ref={combinedRef}
        {...containerProps}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700 rounded transition-colors cursor-pointer',
          isCurrentlyDragOver ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100',
          isActive && 'bg-gray-100 font-medium'
        )}
        style={{ paddingLeft: `${0.5 + level * 1.25 + 1.25}rem` }}
        onClick={handleCollectionClick}
      >
        {collection.type === 'SMART' ? <Settings size={15} /> : <BookText size={15} />}
        <span className="truncate flex-1">{collection.name}</span>
        <CountBadge
          count={collection.type === 'MANUAL' ? collection._count?.collectionStacks : undefined}
        />
      </div>
    </CollectionContextMenu>
  );
}

export const CollectionDropItem = memo(CollectionDropItemComponent);
CollectionDropItem.displayName = 'CollectionDropItem';
