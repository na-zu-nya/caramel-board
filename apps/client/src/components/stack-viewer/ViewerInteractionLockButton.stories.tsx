import type { Meta, StoryObj } from '@storybook/react';
import ViewerInteractionLockButton from './ViewerInteractionLockButton';

const meta: Meta<typeof ViewerInteractionLockButton> = {
  title: 'StackViewer/ViewerInteractionLockButton',
  component: ViewerInteractionLockButton,
  decorators: [
    (Story) => (
      <div className="inline-flex rounded-lg bg-slate-700 p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    lockLabel: '画像操作をロック',
    unlockLabel: '画像操作のロックを解除',
    onToggle: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof ViewerInteractionLockButton>;

export const Unlocked: Story = {
  args: { locked: false },
};

export const Locked: Story = {
  args: { locked: true },
};
