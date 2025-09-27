import { useCallback } from 'react';
import type { Pin } from '@/types';
import { apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { datasetKeys } from './useDatasets';

type DefaultPinSpec = {
  type: Pin['type'];
  name: string;
  icon: string;
  mediaType?: Pin['mediaType'];
};

const DEFAULT_PIN_SPECS: ReadonlyArray<DefaultPinSpec> = [
  {
    type: 'FAVORITES',
    name: 'Favorites',
    icon: 'Star',
  },
  {
    type: 'MEDIA_TYPE',
    name: 'Images',
    icon: 'Image',
    mediaType: 'image',
  },
  {
    type: 'MEDIA_TYPE',
    name: 'Comics',
    icon: 'BookOpen',
    mediaType: 'comic',
  },
  {
    type: 'MEDIA_TYPE',
    name: 'Videos',
    icon: 'Film',
    mediaType: 'video',
  },
];

export interface BootstrapNavigationPinsOptions {
  setAsDefault?: boolean;
}

function isMatchingSpec(spec: DefaultPinSpec, pin: Pin): boolean {
  if (spec.type !== pin.type) return false;
  if (spec.type === 'MEDIA_TYPE') {
    return spec.mediaType === pin.mediaType;
  }
  return true;
}

export function useBootstrapNavigationPins() {
  const queryClient = useQueryClient();

  return useCallback(
    async (datasetId: string | number, options: BootstrapNavigationPinsOptions = {}) => {
      const targetId = Number(datasetId);
      if (!Number.isFinite(targetId)) return;

      if (options.setAsDefault) {
        try {
          await apiClient.setDefaultDataset(targetId);
        } catch (error) {
          console.error('Failed to mark dataset as default during bootstrap', error);
        }
      }

      let existingPins: Pin[] = [];
      try {
        existingPins = await apiClient.getNavigationPinsByDataset(targetId);
      } catch (error) {
        console.error('Failed to fetch navigation pins during bootstrap', error);
      }

      await Promise.all(
        DEFAULT_PIN_SPECS.map(async (spec, index) => {
          const currentPin = existingPins.find((pin) => isMatchingSpec(spec, pin));

          if (currentPin) {
            const updatePayload: { name?: string; icon?: string; order?: number } = {};

            if (currentPin.name !== spec.name) updatePayload.name = spec.name;
            if (currentPin.icon !== spec.icon) updatePayload.icon = spec.icon;
            if (currentPin.order !== index) updatePayload.order = index;

            if (Object.keys(updatePayload).length > 0) {
              try {
                await apiClient.updateNavigationPin(currentPin.id, updatePayload);
              } catch (error) {
                console.error(`Failed to update bootstrap pin: ${spec.name}`, error);
              }
            }
            return;
          }

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

export { DEFAULT_PIN_SPECS };
