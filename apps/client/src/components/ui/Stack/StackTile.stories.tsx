import type { Meta, StoryObj } from '@storybook/react';
import { StackTile } from './StackTile';

const meta: Meta<typeof StackTile> = {
  title: 'Stack/StackTile',
  component: StackTile,
};
export default meta;
type Story = StoryObj<typeof StackTile>;

export const Basic: Story = {
  args: {
    thumbnailUrl: '',
    title: 'Sample Stack',
    pageCount: 12,
    favorited: false,
    likeCount: 3,
    onDownload: () => {
      // Storybook用のダミー動作
      console.log('download originals');
    },
    onRemoveLike: () => {
      // Storybook用のダミー動作
      console.log('unlike stack');
    },
    onRemoveStack: () => {
      // Storybook用のダミー動作
      console.log('remove stack');
    },
  },
};

export const AsLink: Story = {
  args: {
    asChild: true,
    thumbnailUrl: 'https://picsum.photos/id/24/320/320',
    nativeImageDragUrl: 'https://picsum.photos/id/24/1600/1600',
    title: 'Linked Stack',
    pageCount: 8,
    favorited: true,
    likeCount: 12,
    onDownload: () => {
      // Storybook用のダミー動作
      console.log('download linked stack originals');
    },
    children: <a href="/library/1/stacks/1">Linked Stack</a>,
    dragHandlers: {
      draggable: true,
      onDragStart: (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        event.dataTransfer.setData('text/plain', 'stack-item:1');
      },
      onDragEnd: () => {
        console.log('drag end');
      },
    },
  },
};
