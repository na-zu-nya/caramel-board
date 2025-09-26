import type { Meta, StoryObj } from '@storybook/react';
import { HeaderPinsInline } from './HeaderPinsInline';

const meta: Meta<typeof HeaderPinsInline> = {
  title: 'Header/PinsInline',
  component: HeaderPinsInline,
};
export default meta;
type Story = StoryObj<typeof HeaderPinsInline>;

export const Default: Story = {
  args: {
    navigationPins: [
      { id: 1, name: 'Overview', icon: 'Home' },
      { id: 2, name: 'Likes', icon: 'Heart' },
    ],
  },
};
