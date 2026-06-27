import type { Meta, StoryObj } from '@storybook/react';
import { Folder, Heart } from 'lucide-react';
import { SideMenuListItem } from './index';

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
export const LongJapaneseLabel: Story = {
  args: {
    label: 'ライブラリのオーバービューとお気に入り',
    icon: Folder,
    count: 128,
  },
  decorators: [
    (Story) => (
      <div className="w-48 p-2">
        <Story />
      </div>
    ),
  ],
};
export const ChromeRenderingProfile: Story = {
  args: {
    label: 'ライブラリのオーバービューとお気に入り',
    icon: Folder,
    count: 128,
  },
  decorators: [
    (Story) => (
      <div data-rendering-profile="chrome" className="w-48 p-2">
        <Story />
      </div>
    ),
  ],
};
