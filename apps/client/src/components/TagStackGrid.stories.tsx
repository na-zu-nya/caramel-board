import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { routeTree } from '@/routeTree.gen';
import type { MediaGridItem } from '@/types';
import TagStackGrid from './TagStackGrid';

const items: MediaGridItem[] = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  dataSetId: 1,
  name: `Stack ${index + 1}`,
  mediaType: index % 4 === 0 ? 'video' : 'image',
  thumbnailUrl: `https://picsum.photos/seed/tag-stack-${index + 1}/320/320`,
}));

const meta: Meta<typeof TagStackGrid> = {
  title: 'Components/TagStackGrid',
  component: TagStackGrid,
};

export default meta;
type Story = StoryObj<typeof TagStackGrid>;

function TagStackGridStory() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        context: { queryClient },
        history: createMemoryHistory({ initialEntries: ['/library/1/authors'] }),
      }),
    [queryClient]
  );
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedStackIds, setSelectedStackIds] = useState<Set<string | number>>(new Set());

  return (
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <div className="max-w-4xl">
          <TagStackGrid
            items={items}
            isSelectionMode={isSelectionMode}
            selectedItems={selectedStackIds}
            selectedActionCount={selectedStackIds.size}
            onEnterSelectionMode={(stackId) => {
              setIsSelectionMode(true);
              setSelectedStackIds(new Set([stackId]));
            }}
            onToggleSelection={(stackId) => {
              setSelectedStackIds((current) => {
                const next = new Set(current);
                if (next.has(stackId)) {
                  next.delete(stackId);
                } else {
                  next.add(stackId);
                }
                return next;
              });
            }}
            onSelectRange={(stackIds) => {
              setSelectedStackIds((current) => {
                const next = new Set(current);
                for (const stackId of stackIds) {
                  next.add(stackId);
                }
                return next;
              });
            }}
            onBulkEditSelected={() => {
              console.log('bulk edit selected stacks');
            }}
            onDownloadSelected={() => {
              console.log('download selected stacks');
            }}
            onRemoveSelectedStacks={() => {
              setSelectedStackIds(new Set());
              setIsSelectionMode(false);
            }}
          />
        </div>
      </RouterContextProvider>
    </QueryClientProvider>
  );
}

export const Default: Story = {
  render: () => <TagStackGridStory />,
};
