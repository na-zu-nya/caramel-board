import type { Meta, StoryObj } from '@storybook/react';
import { SideMenuListItem } from './index';
import { Home } from 'lucide-react';
import { useState } from 'react';

const meta: Meta<typeof SideMenuListItem> = {
  title: 'SideMenu/ContextMenu',
  component: SideMenuListItem,
};
export default meta;
type Story = StoryObj<typeof SideMenuListItem>;

export const OpenOnly: Story = {
  render: () => <SideMenuListItem icon={Home} label="Overview" enableContextMenu onOpen={() => alert('Open')} />,
};

export const PinToggle: Story = {
  render: () => {
    const [pinned, setPinned] = useState(false);
    return (
      <SideMenuListItem
        icon={Home}
        label={`Overview ${pinned ? '(Pinned)' : ''}`}
        enableContextMenu
        pinnable
        pinned={pinned}
        onPin={() => setPinned(true)}
        onUnpin={() => setPinned(false)}
      />
    );
  },
};
