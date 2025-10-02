import type { Meta, StoryObj } from '@storybook/react';
import { JoyTagStatus } from './index';

const meta: Meta<typeof JoyTagStatus> = {
  title: 'UI/JoyTagStatus',
  component: JoyTagStatus,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof JoyTagStatus>;

export const Running: Story = {
  args: {
    status: 'running',
  },
};

export const NotAvailable: Story = {
  args: {
    status: 'not-available',
    message: 'No response from JoyTag health endpoint',
  },
};

export const Loading: Story = {
  args: {
    status: 'not-available',
    isLoading: true,
  },
};

export const WithMessage: Story = {
  args: {
    status: 'running',
    message: 'Device: cuda',
  },
};
