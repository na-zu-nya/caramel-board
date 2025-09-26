import type { Meta, StoryObj } from '@storybook/react';
import { CountBadge } from './CountBadge';

const meta: Meta<typeof CountBadge> = {
  title: 'SideMenu/CountBadge',
  component: CountBadge,
};
export default meta;
type Story = StoryObj<typeof CountBadge>;

export const Small: Story = { args: { count: 1 } };
export const Large: Story = { args: { count: 12345 } };

