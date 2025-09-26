import type { Meta, StoryObj } from '@storybook/react';
import { SideMenuMessage } from './index';

const meta: Meta<typeof SideMenuMessage> = {
  title: 'SideMenu/Message',
  component: SideMenuMessage,
};
export default meta;
type Story = StoryObj<typeof SideMenuMessage>;

export const Muted: Story = { args: { children: 'No Collections or Folders' } };
export const Info: Story = { args: { variant: 'info', children: 'Loading…' } };
export const Warn: Story = { args: { variant: 'warn', children: 'Be careful' } };
export const Error: Story = { args: { variant: 'error', children: 'Something went wrong' } };
