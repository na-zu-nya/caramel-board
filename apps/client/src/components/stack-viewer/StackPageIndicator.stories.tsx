import type { Meta, StoryObj } from '@storybook/react';
import StackPageIndicator from './StackPageIndicator';

const meta: Meta<typeof StackPageIndicator> = {
  title: 'StackViewer/StackPageIndicator',
  component: StackPageIndicator,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="relative h-36 w-72 rounded-lg bg-black">
        <Story />
      </div>
    ),
  ],
  args: {
    currentPage: 2,
    totalPages: 8,
    isGesturing: false,
  },
};

export default meta;

type Story = StoryObj<typeof StackPageIndicator>;

export const Default: Story = {};

export const Gesturing: Story = {
  args: {
    isGesturing: true,
  },
};
