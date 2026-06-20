import { describe, expect, it } from 'vitest';
import { getMediaGridItemStackId, getSelectedMediaGridStackIds } from '@/lib/media-grid-selection';
import type { MediaGridItem } from '@/types';

describe('media grid selection', () => {
  it('uses stackId before item id for stack operations', () => {
    const item: MediaGridItem = {
      id: 'favorite-asset-42',
      stackId: 128,
      name: 'Favorite asset',
    };

    expect(getMediaGridItemStackId(item)).toBe(128);
  });

  it('maps selected item ids to ordered unique stack ids', () => {
    const items: MediaGridItem[] = [
      { id: 'favorite-1', stackId: 10, name: 'First' },
      { id: 'favorite-2', stackId: 20, name: 'Second' },
      { id: 'favorite-3', stackId: 10, name: 'Duplicate stack' },
    ];

    expect(getSelectedMediaGridStackIds(['favorite-2', 'favorite-1', 'favorite-3'], items)).toEqual(
      [20, 10]
    );
  });

  it('falls back to the selected id when the item is not loaded', () => {
    expect(getSelectedMediaGridStackIds([3, '4'], [])).toEqual([3, 4]);
  });
});
