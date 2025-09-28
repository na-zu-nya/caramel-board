import type { Meta, StoryObj } from '@storybook/react';

import { CaramelBoardLogo } from './index';

const meta: Meta<typeof CaramelBoardLogo> = {
  title: 'UI/CaramelBoardLogo',
  component: CaramelBoardLogo,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    className: {
      control: { type: 'text' },
    },
  },
};

export default meta;

type Story = StoryObj<typeof CaramelBoardLogo>;

export const Default: Story = {
  args: {
    className: 'h-6 text-gray-900',
  },
};

export const OnAccent: Story = {
  render: (args) => (
    <div className="bg-orange-500 px-6 py-4">
      <CaramelBoardLogo {...args} className="h-8 text-white" />
    </div>
  ),
};
