import type { Meta, StoryObj } from '@storybook/react';
import { SideMenuListItem } from './index';
import { Folder, Heart } from 'lucide-react';

const meta: Meta<typeof SideMenuListItem> = {
  title: 'SideMenu/ListItem',
  component: SideMenuListItem,
};
export default meta;
type Story = StoryObj<typeof SideMenuListItem>;

export const Default: Story = { args: { label: 'Item' } };
export const WithIcon: Story = { args: { label: 'Folder', icon: Folder } };
export const WithCount: Story = { args: { label: 'Likes', icon: Heart, count: 42 } };
export const Active: Story = { args: { label: 'Active', icon: Folder, active: true } };
