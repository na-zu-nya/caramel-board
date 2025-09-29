import type { Meta, StoryObj } from '@storybook/react';
import { MonthSectionHeader } from './MonthSectionHeader';

const meta: Meta<typeof MonthSectionHeader> = {
  title: 'UI/MonthSectionHeader',
  component: MonthSectionHeader,
  args: {
    month: 'September',
    likeCount: 24,
  },
};

export default meta;

type Story = StoryObj<typeof MonthSectionHeader>;

export const Default: Story = {};

export const SingleLike: Story = {
  args: {
    month: 'January',
    likeCount: 1,
  },
};

export const LargeVolume: Story = {
  args: {
    month: 'December',
    likeCount: 2048,
  },
};
