import type { Meta, StoryObj } from '@storybook/react';
import { HeaderPinsCompact } from './HeaderPinsCompact';

const meta: Meta<typeof HeaderPinsCompact> = {
  title: 'Header/PinsCompact',
  component: HeaderPinsCompact,
};
export default meta;
type Story = StoryObj<typeof HeaderPinsCompact>;

export const Default: Story = {
  args: {
    navigationPins: [
      { id: 1, name: 'Overview', icon: 'Home' },
      { id: 2, name: 'Likes', icon: 'Heart' },
    ],
  },
};
