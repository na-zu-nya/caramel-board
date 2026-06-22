import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { routeTree } from '@/routeTree.gen';
import { StackTileGrid } from './StackTileGrid';

type StoryStackItem = {
  id: number;
  name: string;
  thumbnailUrl: string;
  assetCount: number;
  liked: number;
  favorited: boolean;
  mediaType: string;
};

const items: StoryStackItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `Stack ${index + 1}`,
  thumbnailUrl: `https://picsum.photos/seed/stack-tile-grid-${index + 1}/320/320`,
  assetCount: index + 2,
  liked: index % 4,
  favorited: index % 3 === 0,
  mediaType: index % 4 === 0 ? 'video' : 'image',
}));
const selectedPreviewItemIds = items.slice(1, 3).map((item) => item.id);

const meta: Meta<typeof StackTileGrid> = {
  title: 'Components/StackTileGrid',
  component: StackTileGrid,
};

export default meta;
type Story = StoryObj<typeof StackTileGrid>;

function SelectableStackTileGrid({ cornerRadius }: { cornerRadius: 'rounded' | 'none' }) {
  const queryClient = useMemo(() => {
    const client = new QueryClient();
    client.setQueryData(['collection-folders', '1'], {
      folders: [
        {
          id: 10,
          name: 'Projects',
          icon: '📁',
          dataSetId: 1,
          parentId: undefined,
          order: 0,
          createdAt: '',
          updatedAt: '',
          children: [
            {
              id: 11,
              name: 'Nested',
              icon: '📁',
              dataSetId: 1,
              parentId: 10,
              order: 0,
              createdAt: '',
              updatedAt: '',
              children: [],
              collections: [
                {
                  id: 1,
                  name: 'Reference',
                  icon: 'BookText',
                  type: 'MANUAL',
                  dataSetId: 1,
                  createdAt: '',
                  updatedAt: '',
                },
              ],
            },
          ],
          collections: [
            {
              id: 2,
              name: 'Moodboard',
              icon: 'Star',
              type: 'MANUAL',
              dataSetId: 1,
              createdAt: '',
              updatedAt: '',
            },
          ],
        },
        {
          id: 12,
          name: 'Empty Folder',
          icon: '📁',
          dataSetId: 1,
          parentId: undefined,
          order: 1,
          createdAt: '',
          updatedAt: '',
          children: [],
          collections: [],
        },
      ],
      rootCollections: [
        {
          id: 3,
          name: 'Root Collection',
          icon: 'Bookmark',
          type: 'MANUAL',
          dataSetId: 1,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    return client;
  }, []);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        context: { queryClient },
        history: createMemoryHistory({ initialEntries: ['/library/1/tags'] }),
      }),
    [queryClient]
  );
  const [isSelectionMode, setIsSelectionMode] = useState(cornerRadius === 'none');
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(
    () => new Set(cornerRadius === 'none' ? selectedPreviewItemIds : [])
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <div className="max-w-5xl">
          <StackTileGrid
            items={items}
            datasetId="1"
            gridClassName="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
            cornerRadius={cornerRadius}
            isSelectionMode={isSelectionMode}
            selectedItems={selectedItems}
            selectedActionCount={selectedItems.size}
            getLinkElement={(item) => <a href={`/library/1/stacks/${item.id}`} />}
            onEnterSelectionMode={(itemId) => {
              setIsSelectionMode(true);
              setSelectedItems(new Set([itemId]));
            }}
            onToggleSelection={(itemId) => {
              setSelectedItems((current) => {
                const next = new Set(current);
                if (next.has(itemId)) {
                  next.delete(itemId);
                } else {
                  next.add(itemId);
                }
                return next;
              });
            }}
            onSelectRange={(itemIds) => {
              setSelectedItems((current) => {
                const next = new Set(current);
                for (const itemId of itemIds) {
                  next.add(itemId);
                }
                return next;
              });
            }}
            onOpenItem={() => undefined}
            onInfoItem={() => undefined}
            onFindSimilarItem={() => undefined}
            onAddToScratchItem={() => undefined}
            onDownloadItem={() => undefined}
            onDownloadSelected={() => undefined}
            onBulkEditSelected={() => undefined}
            onRemoveSelectedStacks={() => {
              setSelectedItems(new Set());
              setIsSelectionMode(false);
            }}
            onToggleFavoriteItem={() => undefined}
            onLikeItem={() => undefined}
          />
        </div>
      </RouterContextProvider>
    </QueryClientProvider>
  );
}

export const Rounded: Story = {
  render: () => <SelectableStackTileGrid cornerRadius="rounded" />,
};

export const NonRoundedSelection: Story = {
  render: () => <SelectableStackTileGrid cornerRadius="none" />,
};
