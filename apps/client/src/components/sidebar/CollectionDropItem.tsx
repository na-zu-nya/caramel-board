import { CollectionContextMenu } from '@/components/modals/CollectionContextMenu';
import { CountBadge } from '@/components/ui/SideMenu/CountBadge';
import { useTouchDropZone } from '@/hooks/useTouchDragDrop';
import { useSidebarDrop } from '@/hooks/useSidebarDrop';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Collection } from '@/types';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { BookText, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

interface CollectionDropItemProps {
  collection: Collection;
  isPinned: boolean;
  onUpdate: () => void;
  onDelete: () => void;
  onPin: (iconName: string, name: string) => void;
  onUnpin: () => void;
  onStackAdded: () => void;
  level?: number;
}

export function CollectionDropItem({
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
  const location = useLocation();

  const getDatasetIdFromPath = useCallback(() => {
    const pathMatch = location.pathname.match(/\/library\/([^\/]+)/);
    return pathMatch ? pathMatch[1] : '1';
  }, [location.pathname]);

  const extractStackIdsFromDragData = useCallback((dragData: any): number[] => {
    if (!dragData) return [];

    if (Array.isArray(dragData.stackIds)) {
      return dragData.stackIds.map((id: any) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    }

    if (Array.isArray(dragData.items)) {
      return dragData.items
        .map((item: any) => Number(item?.stackId ?? item))
        .filter((id) => Number.isInteger(id) && id > 0);
    }

    if (typeof dragData.stackId !== 'undefined') {
      const id = Number(dragData.stackId);
      return Number.isInteger(id) && id > 0 ? [id] : [];
    }

    if (typeof dragData === 'number') {
      return Number.isInteger(dragData) && dragData > 0 ? [dragData] : [];
    }

    if (typeof dragData === 'string') {
      const parsed = Number(dragData);
      return Number.isInteger(parsed) && parsed > 0 ? [parsed] : [];
    }

    return [];
  }, []);

  const addStacksToCollection = useCallback(
    async (stackIds: number[]) => {
      if (collection.type !== 'MANUAL') {
        console.log('🟨 Drop ignored: collection is not manual');
        return;
      }

      const uniqueIds = Array.from(new Set(stackIds.filter((id) => Number.isInteger(id) && id > 0)));
      if (uniqueIds.length === 0) {
        console.log('🟨 Drop ignored: no valid stackIds');
        return;
      }

      try {
        if (uniqueIds.length === 1) {
          await apiClient.addStackToCollection(collection.id, uniqueIds[0]);
          console.log(`✅ Stack ${uniqueIds[0]} added to collection ${collection.name}`);
          onStackAdded();
          return;
        }

        try {
          await apiClient.bulkAddStacksToCollection(collection.id, uniqueIds);
          console.log(`✅ Added ${uniqueIds.length} stacks to collection ${collection.name}`);
          onStackAdded();
        } catch (bulkError) {
          console.warn('⚠️ Bulk add failed, falling back to individual adds', bulkError);
          let successCount = 0;
          let skipCount = 0;

          for (const id of uniqueIds) {
            try {
              await apiClient.addStackToCollection(collection.id, id);
              successCount++;
            } catch (err) {
              if (err instanceof Error && err.message?.toLowerCase().includes('already')) {
                skipCount++;
              } else {
                console.error(`❌ Failed to add stack ${id}:`, err);
              }
            }
          }

          if (successCount > 0) {
            console.log(`✅ Added ${successCount} stacks, skipped ${skipCount} duplicates`);
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
    async (dragData: any) => {
      console.log('🟢 handleDropLogic called with data:', dragData);
      const stackIds = extractStackIdsFromDragData(dragData);
      await addStacksToCollection(stackIds);
    },
    [extractStackIdsFromDragData, addStacksToCollection]
  );

  const { containerProps, showDropIndicator } = useSidebarDrop({
    acceptDrop: collection.type === 'MANUAL',
    onDrop: addStacksToCollection,
  });

  const { isDragOver: isTouchDragOver, setupDropZone } = useTouchDropZone({
    canDrop: (dragData) => {
      const ids = extractStackIdsFromDragData(dragData);
      const canDrop = collection.type === 'MANUAL' && ids.length > 0;
      console.log('🟦 canDrop check:', { ids, collectionType: collection.type, canDrop });
      return canDrop;
    },
    onDrop: handleDropLogic,
    onDragEnter: () => {
      console.log('🟦 Touch drag enter collection:', collection.name);
    },
    onDragLeave: () => {
      console.log('🟦 Touch drag leave collection:', collection.name);
    },
  });

  useEffect(() => {
    const cleanup = setupDropZone(dropElementRef.current);
    return cleanup;
  }, [setupDropZone]);

  const isCurrentlyDragOver = useMemo(
    () => showDropIndicator || isTouchDragOver,
    [showDropIndicator, isTouchDragOver]
  );

  const isActive = location.pathname.includes(`/collections/${collection.id}`);

  const handleCollectionClick = useCallback(() => {
    const datasetId = getDatasetIdFromPath();
    navigate({
      to: '/library/$datasetId/collections/$collectionId',
      params: () => ({
        datasetId: String(datasetId),
        collectionId: String(collection.id),
      }),
    });
  }, [collection.id, getDatasetIdFromPath, navigate]);

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      dropElementRef.current = node;
    },
    []
  );

  return (
    <CollectionContextMenu
      collection={collection}
      onUpdate={onUpdate}
      onDelete={onDelete}
      isPinned={isPinned}
      onPin={onPin}
      onUnpin={onUnpin}
      onOpen={handleCollectionClick}
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
        <CountBadge count={collection.type === 'MANUAL' ? collection._count?.collectionStacks : undefined} />
      </div>
    </CollectionContextMenu>
  );
}
