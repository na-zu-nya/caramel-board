import type { Meta, StoryObj } from '@storybook/react';
import { SimilarResultsHeader } from './SimilarResultsHeader';

const meta: Meta<typeof SimilarResultsHeader> = {
  title: 'Components/SimilarResultsHeader',
  component: SimilarResultsHeader,
  args: {
    label: 'コレクションに類似: 東北きりたん',
    refreshLabel: 'リストを更新',
    onRefresh: () => undefined,
  },
};

export default meta;

type Story = StoryObj<typeof SimilarResultsHeader>;

export const Default: Story = {};

export const Refreshing: Story = {
  args: {
    isRefreshing: true,
  },
};
