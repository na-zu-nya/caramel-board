import type { Meta, StoryObj } from '@storybook/react';
import { Filter } from 'lucide-react';
import type { CSSProperties } from 'react';
import { HeaderIconButton } from './HeaderIconButton';

const meta: Meta<typeof HeaderIconButton> = {
  title: 'Header/HeaderIconButton',
  component: HeaderIconButton,
  args: {},
};

export default meta;
type Story = StoryObj<typeof HeaderIconButton>;

const themedPrimaryStyle: CSSProperties & Record<'--primary', string> = {
  '--primary': 'oklch(0.646 0.222 41.116)',
};

export const Default: Story = {};
export const WithBadge: Story = {
  args: {
    badge: true,
    badgeColor: 'primary',
    children: <Filter size={18} />,
    'aria-label': 'Filter',
  },
};
export const Active: Story = {
  args: { isActive: true, children: <Filter size={18} />, 'aria-label': 'Filter' },
};
export const ActiveThemed: Story = {
  render: (args) => (
    <div className="bg-slate-700 p-4" style={themedPrimaryStyle}>
      <HeaderIconButton {...args} />
    </div>
  ),
  args: { isActive: true, children: <Filter size={18} />, 'aria-label': 'Filter' },
};
export const Highlight: Story = { args: { variant: 'highlight' } };
export const TextToggle: Story = {
  args: {
    isActive: true,
    children: <span className="text-[11px] font-semibold leading-none">DRAG</span>,
    'aria-label': 'Drag mode',
  },
};
