import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { type ComponentProps, useMemo } from 'react';
import { routeTree } from '@/routeTree.gen';
import { SettingsSection } from './SettingsSection';

const meta: Meta<typeof SettingsSection> = {
  title: 'Sidebar/SettingsSection',
  component: SettingsSection,
  args: {
    datasetId: '1',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsSection>;

function SettingsSectionStory(args: ComponentProps<typeof SettingsSection>) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        context: { queryClient },
        history: createMemoryHistory({ initialEntries: ['/settings/general'] }),
      }),
    [queryClient]
  );

  return (
    <RouterContextProvider router={router}>
      <div className="w-64 rounded-md border border-gray-200 bg-white p-3">
        <SettingsSection {...args} />
      </div>
    </RouterContextProvider>
  );
}

export const Expanded: Story = {
  render: (args) => <SettingsSectionStory {...args} />,
};

export const Collapsed: Story = {
  args: {
    isCollapsed: true,
  },
  render: (args) => <SettingsSectionStory {...args} />,
};
