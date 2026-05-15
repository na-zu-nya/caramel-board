import type { Meta, StoryObj } from '@storybook/react';
import StackToolbar from './StackToolbar';

const baseStack = {
  id: 1,
  datasetId: '1',
  name: 'Merged Stack',
  mediaType: 'image' as const,
  assetCount: 6,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  favorited: false,
  liked: 3,
  assets: [],
};

const meta: Meta<typeof StackToolbar> = {
  title: 'StackViewer/StackToolbar',
  component: StackToolbar,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="relative h-40 w-80 rounded-xl bg-slate-900 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    stack: baseStack,
    isListMode: true,
    isGesturing: false,
    onFavoriteToggle: () => console.log('favorite'),
    onLikeToggle: () => console.log('like'),
    onListModeToggle: () => console.log('list'),
  },
};

export default meta;

type Story = StoryObj<typeof StackToolbar>;

export const Default: Story = {};

export const SingleMode: Story = {
  args: {
    isListMode: false,
  },
};
