import type { Meta, StoryObj } from '@storybook/react';
import { LibraryCard } from './index';

const meta: Meta<typeof LibraryCard> = {
  title: 'Library/LibraryCard',
  component: LibraryCard,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LibraryCard>;

const baseCallbacks = {
  onUpdate: () => {},
  onDelete: () => {},
  onSetDefault: () => {},
  onStartRefresh: () => {},
  onProtectionClick: () => {},
};

export const Unlocked: Story = {
  args: {
    dataset: {
      id: 'library-1',
      name: 'Caramel Library',
      icon: '🍬',
      itemCount: 128,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-10T00:00:00.000Z',
      themeColor: '#C7743C',
      isDefault: true,
      isProtected: false,
      authorized: true,
    },
    colorStats: null,
    isRefreshing: false,
    disableSetDefault: false,
    ...baseCallbacks,
  },
};

export const Locked: Story = {
  args: {
    dataset: {
      id: 'library-locked',
      name: 'Protected Library',
      icon: '🔒',
      itemCount: 0,
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-10T00:00:00.000Z',
      themeColor: '#9F582C',
      isDefault: false,
      isProtected: true,
      authorized: false,
    },
    colorStats: null,
    isRefreshing: false,
    disableSetDefault: true,
    ...baseCallbacks,
  },
};
