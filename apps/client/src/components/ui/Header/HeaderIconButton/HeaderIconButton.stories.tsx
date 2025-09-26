import type { Meta, StoryObj } from '@storybook/react';
import { HeaderIconButton } from './HeaderIconButton';
import { Filter } from 'lucide-react';

const meta: Meta<typeof HeaderIconButton> = {
  title: 'Header/HeaderIconButton',
  component: HeaderIconButton,
  args: {},
};

export default meta;
type Story = StoryObj<typeof HeaderIconButton>;

export const Default: Story = {};
export const WithBadge: Story = {
  args: { badge: true, badgeColor: 'primary', children: <Filter size={18} />, 'aria-label': 'Filter' },
};
export const Active: Story = {
  args: { isActive: true, children: <Filter size={18} />, 'aria-label': 'Filter' },
};
export const Highlight: Story = { args: { variant: 'highlight' } };
