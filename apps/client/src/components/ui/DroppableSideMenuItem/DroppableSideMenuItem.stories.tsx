import type { Meta, StoryObj } from '@storybook/react';
import { Star } from 'lucide-react';
import { DroppableSideMenuItem } from './DroppableSideMenuItem';

const meta: Meta<typeof DroppableSideMenuItem> = {
  title: 'SideMenu/DroppableItem',
  component: DroppableSideMenuItem,
};
export default meta;
type Story = StoryObj<typeof DroppableSideMenuItem>;

export const AsLink: Story = {
  args: {
    asChild: true,
    icon: Star,
    label: 'Favorites',
    count: 12,
    onStacksDrop: async (ids: number[]) => console.log('dropped', ids),
    children: <a href="#favorites" />,
  },
};
