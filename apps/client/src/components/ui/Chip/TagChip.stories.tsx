import type { Meta, StoryObj } from '@storybook/react';
import { TagChip } from './TagChip';

const meta: Meta<typeof TagChip> = {
  title: 'Chip/TagChip',
  component: TagChip,
};
export default meta;
type Story = StoryObj<typeof TagChip>;

export const Default: Story = { args: { name: 'landscape', count: 42 } };
export const WithoutCount: Story = { args: { name: 'portrait' } };
export const CustomColor: Story = { args: { name: 'sunset', count: 128, color: '#EF4444' } };
export const LightCustomColor: Story = {
  args: { name: 'pastel', count: 64, color: '#FDE68A' },
};
export const CustomForegroundColor: Story = {
  args: {
    name: 'contrast',
    count: 12,
    color: '#FDE68A',
    foregroundColor: '#111111',
  },
};
