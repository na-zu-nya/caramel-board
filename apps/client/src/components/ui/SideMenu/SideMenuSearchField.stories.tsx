import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SideMenuSearchField } from './index';

const meta: Meta<typeof SideMenuSearchField> = {
  title: 'SideMenu/SideMenuSearchField',
  component: SideMenuSearchField,
};

export default meta;

export const Basic: StoryObj<typeof SideMenuSearchField> = {
  render: () => {
    const [q, setQ] = useState('');
    return (
      <div className="p-4 w-80">
        <SideMenuSearchField value={q} onValueChange={setQ} placeholder="Filter items..." />
        <div className="mt-2 text-xs text-gray-500">Value: {q || '(empty)'}</div>
      </div>
    );
  },
};
