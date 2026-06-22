import type { Meta, StoryObj } from '@storybook/react';
import EdgeNavigationAffordance from './EdgeNavigationAffordance';

const meta: Meta<typeof EdgeNavigationAffordance> = {
  title: 'StackViewer/EdgeNavigationAffordance',
  component: EdgeNavigationAffordance,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="relative h-screen bg-black">
        <div className="absolute inset-16 flex items-center justify-center bg-neutral-900">
          <div className="h-[70vh] w-[45vh] bg-neutral-700" />
        </div>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EdgeNavigationAffordance>;

export const HardEdges: Story = {
  args: {
    leftKind: 'hard',
    rightKind: 'hard',
    active: true,
    resetKey: 'hard-edges',
  },
};

export const StackBoundary: Story = {
  args: {
    leftKind: 'stack-boundary',
    rightKind: null,
    active: true,
    resetKey: 'stack-boundary',
  },
};

export const Suppressed: Story = {
  args: {
    leftKind: 'stack-boundary',
    rightKind: 'hard',
    active: false,
    resetKey: 'suppressed',
  },
};
