import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { useMemo, useState } from 'react';
import { routeTree } from '@/routeTree.gen';
import { filterOpenAtom } from '@/stores/ui';
import type { StackFilter } from '@/types';
import FilterPanel from './FilterPanel';

const meta: Meta<typeof FilterPanel> = {
  title: 'Components/FilterPanel',
  component: FilterPanel,
};

export default meta;
type Story = StoryObj<typeof FilterPanel>;
type SortState = { field: string; order: 'asc' | 'desc' };

interface FilterPanelStoryProps {
  initialFilter: StackFilter;
  initialSort?: SortState;
}

function FilterPanelStory({
  initialFilter,
  initialSort = { field: 'dateAdded', order: 'desc' },
}: FilterPanelStoryProps) {
  const [filter, setFilter] = useState<StackFilter>(initialFilter);
  const [sort, setSort] = useState<SortState>(initialSort);
  const queryClient = useMemo(() => new QueryClient(), []);
  const jotaiStore = useMemo(() => {
    const store = createStore();
    store.set(filterOpenAtom, true);
    return store;
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

  return (
    <QueryClientProvider client={queryClient}>
      <RouterContextProvider router={router}>
        <JotaiProvider store={jotaiStore}>
          <div className="h-[760px] bg-gray-100">
            <FilterPanel
              currentFilter={filter}
              currentSort={sort}
              onFilterChange={setFilter}
              onSortChange={setSort}
            />
          </div>
        </JotaiProvider>
      </RouterContextProvider>
    </QueryClientProvider>
  );
}

const selectedMediaTypeFilter: StackFilter = {
  datasetId: '1',
  search: 'blue reference',
  mediaCategory: 'comic',
  mediaTypes: ['image', 'multipleImages'],
};

const allMediaTypeFilter: StackFilter = {
  datasetId: '1',
  search: 'blue reference',
  mediaCategory: 'comic',
};

export const Default: Story = {
  render: () => <FilterPanelStory initialFilter={selectedMediaTypeFilter} />,
};

export const AllMediaTypes: Story = {
  render: () => <FilterPanelStory initialFilter={allMediaTypeFilter} />,
};
