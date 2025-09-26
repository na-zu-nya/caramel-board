import type { Meta, StoryObj } from '@storybook/react';
import { SideMenuFolderItem } from './index';

const meta: Meta<typeof SideMenuFolderItem> = {
  title: 'SideMenu/FolderItem',
  component: SideMenuFolderItem,
};
export default meta;
type Story = StoryObj<typeof SideMenuFolderItem>;

export const Closed: Story = { args: { label: 'Folder', indent: 0 } };
export const Opened: Story = { args: { label: 'Folder', indent: 0, open: true } };
export const Nested: Story = { args: { label: 'Nested', indent: 2 } };
