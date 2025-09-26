import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { datasetKeys } from './useDatasets';

const DEFAULT_PIN_SPECS = [
  {
    type: 'FAVORITES' as const,
    name: 'Favorites',
    icon: 'Heart',
  },
  {
    type: 'MEDIA_TYPE' as const,
    name: 'Images',
    icon: 'Image',
    mediaType: 'image' as const,
  },
  {
    type: 'MEDIA_TYPE' as const,
    name: 'Comics',
    icon: 'BookOpen',
    mediaType: 'comic' as const,
  },
  {
    type: 'MEDIA_TYPE' as const,
    name: 'Videos',
    icon: 'Film',
    mediaType: 'video' as const,
  },
];

export function useFirstLibraryBootstrap() {
  const queryClient = useQueryClient();

  return useCallback(
    async (datasetId: string | number) => {
      const targetId = Number(datasetId);
      if (!Number.isFinite(targetId)) return;

      try {
        await apiClient.setDefaultDataset(targetId);
      } catch (error) {
        console.error('Failed to mark first library as default', error);
      }

      await Promise.all(
        DEFAULT_PIN_SPECS.map(async (spec, index) => {
          try {
            await apiClient.createNavigationPin({
              type: spec.type,
              name: spec.name,
              icon: spec.icon,
              order: index,
              dataSetId: targetId,
              mediaType: spec.mediaType,
            });
          } catch (error) {
            console.error(`Failed to bootstrap pin: ${spec.name}`, error);
          }
        })
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['navigation-pins', String(targetId)] }),
        queryClient.invalidateQueries({ queryKey: datasetKeys.all }),
      ]);
    },
    [queryClient]
  );
}
