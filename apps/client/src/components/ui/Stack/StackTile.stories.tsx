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
    collectionMenu: {
      collections: [
        { id: 1, name: 'Reference' },
        { id: 2, name: 'Moodboard' },
      ],
      onCreateCollection: () => {
        console.log('create collection from stack');
      },
      onAddToCollection: (collectionId) => {
        console.log('add stack to collection', collectionId);
      },
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

export const SelectedBatch: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/id/42/320/320',
    title: 'Selected Stack',
    pageCount: 6,
    favorited: false,
    likeCount: 0,
    isSelectionMode: true,
    isSelected: true,
    selectedActionCount: 3,
    onDownload: () => {
      console.log('download stack originals');
    },
    onDownloadSelected: () => {
      console.log('download selected stack originals');
    },
    onBulkEditSelected: () => {
      console.log('bulk edit selected stacks');
    },
    onMergeSelected: () => {
      console.log('merge selected stacks');
    },
    onRemoveSelectedStacks: () => {
      console.log('remove selected stacks');
    },
    onToggleSelection: () => {
      console.log('toggle stack selection');
    },
  },
};

export const NonRounded: Story = {
  args: {
    cornerRadius: 'none',
    thumbnailUrl: 'https://picsum.photos/id/54/320/320',
    title: 'Immediate List Stack',
    pageCount: 4,
    favorited: true,
    likeCount: 2,
    onDownload: () => {
      console.log('download non-rounded stack originals');
    },
  },
};
