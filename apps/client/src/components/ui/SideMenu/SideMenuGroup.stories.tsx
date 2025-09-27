import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from 'lucide-react';
import { SideMenuGroup, SideMenuListItem } from './index';

const meta: Meta<typeof SideMenuGroup> = {
  title: 'SideMenu/Group',
  component: SideMenuGroup,
};
export default meta;
type Story = StoryObj<typeof SideMenuGroup>;

export const Default: Story = {
  args: {
    label: 'Group',
    children: (
      <div>
        <SideMenuListItem label="Item 1" />
        <SideMenuListItem label="Item 2" icon={Tag} />
      </div>
    ),
  },
};
