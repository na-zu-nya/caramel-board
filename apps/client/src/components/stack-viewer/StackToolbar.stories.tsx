import type { Meta, StoryObj } from '@storybook/react';
import { FloatingUploadAction } from '@/components/ui/FloatingUploadAction';
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
      <div className="relative h-44 w-[44rem] rounded-xl bg-slate-900 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    stack: baseStack,
    isListMode: true,
    isGesturing: false,
    isCurrentAssetFavorited: false,
    onStackFavoriteToggle: () => console.log('stack favorite'),
    onAssetFavoriteToggle: () => console.log('page bookmark'),
    onLikeToggle: () => console.log('like'),
    onListModeToggle: () => console.log('list'),
    displayMode: 'single',
    onDisplayModeToggle: () => console.log('display mode'),
    leadingAction: (
      <FloatingUploadAction
        variant="toolbar"
        onFiles={(files) => console.log('files', files)}
        onUrls={(urls) => console.log('urls', urls)}
      />
    ),
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

export const CurrentPageFavorited: Story = {
  args: {
    isCurrentAssetFavorited: true,
  },
};

export const StackFavorited: Story = {
  args: {
    stack: {
      ...baseStack,
      favorited: true,
    },
  },
};

export const SpreadMode: Story = {
  args: {
    displayMode: 'spread',
  },
};

export const SinglePageStack: Story = {
  args: {
    stack: {
      ...baseStack,
      assetCount: 1,
      assetsCount: 1,
    },
  },
};
