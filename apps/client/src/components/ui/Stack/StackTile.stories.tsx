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
  },
};

