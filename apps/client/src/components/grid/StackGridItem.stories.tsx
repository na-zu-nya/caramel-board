import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { type ComponentProps, useMemo } from 'react';
import { routeTree } from '@/routeTree.gen';
import type { MediaGridItem } from '@/types';
import { StackGridItem } from './StackGridItem';

const sampleItem: MediaGridItem = {
  id: 42,
  stackId: 42,
  name: 'Sample Stack',
  mediaType: 'image',
  thumbnailUrl: 'https://picsum.photos/id/1062/480/480',
  assetCount: 12,
  likeCount: 18,
  favorited: true,
};

const meta: Meta<typeof StackGridItem> = {
  title: 'Grid/StackGridItem',
  component: StackGridItem,
  args: {
    item: sampleItem,
    isSelected: false,
    isInfoSelected: false,
    isSelectionMode: false,
    isFavoritePending: false,
    onItemClick: () => {
      console.log('item click');
    },
    onToggleSelection: () => {
      console.log('toggle selection');
    },
    onToggleFavorite: () => {
      console.log('toggle favorite');
    },
    collectionMenuCollections: [
      { id: 1, name: 'Reference', icon: 'folder' },
      { id: 2, name: 'Moodboard', icon: 'folder' },
    ],
    onAddStacksToCollection: async (collectionId, stackIds) => {
      console.log('add stacks to collection', collectionId, stackIds);
    },
    onCreateCollectionWithStacks: async (stackIds) => {
      console.log('create collection with stacks', stackIds);
    },
  },
};

export default meta;
type Story = StoryObj<typeof StackGridItem>;

function StackGridItemStory(args: ComponentProps<typeof StackGridItem>) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        context: { queryClient },
        history: createMemoryHistory({ initialEntries: ['/library/1'] }),
      }),
    [queryClient]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <div className="w-56">
          <StackGridItem {...args} />
        </div>
      </RouterContextProvider>
    </QueryClientProvider>
  );
}

export const Default: Story = {
  render: (args) => <StackGridItemStory {...args} />,
};

export const SelectionMode: Story = {
  args: {
    isSelectionMode: true,
    isSelected: true,
    selectedItems: new Set([sampleItem.id, 43]),
    selectedStackIdsInOrder: [Number(sampleItem.id), 43],
    onBulkEditSelected: async () => {
      console.log('bulk edit selected stacks');
    },
    onMergeStacks: async () => {
      console.log('merge selected stacks');
    },
    onRemoveSelectedStacks: async (stackIds) => {
      console.log('remove selected stacks', stackIds);
    },
  },
  render: (args) => <StackGridItemStory {...args} />,
};

export const Blurred: Story = {
  decorators: [
    (Story) => {
      return (
        <div className="caramel-thumbnail-blur-active">
          <Story />
        </div>
      );
    },
  ],
  render: (args) => <StackGridItemStory {...args} />,
};
