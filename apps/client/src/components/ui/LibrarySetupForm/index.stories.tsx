import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DEFAULT_CARAMEL_COLOR } from '@/components/ui/LibraryCard';
import { LibrarySetupForm } from './index';

const meta: Meta<typeof LibrarySetupForm> = {
  title: 'Setup/LibrarySetupForm',
  component: LibrarySetupForm,
};

export default meta;

type Story = StoryObj<typeof LibrarySetupForm>;

export const Default: Story = {
  render: (args) => {
    const [name, setName] = useState('Caramel Library');
    const [icon, setIcon] = useState('🍬');
    const [color, setColor] = useState(DEFAULT_CARAMEL_COLOR);

    return (
      <div className="max-w-xl">
        <LibrarySetupForm
          {...args}
          name={name}
          icon={icon}
          color={color}
          onNameChange={setName}
          onIconChange={setIcon}
          onColorChange={setColor}
          onSubmit={() => console.log('submit')}
          focusOnMount
        />
      </div>
    );
  },
  args: {
    description: 'ライブラリ名は後からでも変更できます。',
  },
};
