import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import { GridColumnSlider } from './index';

const themedPrimaryStyle: CSSProperties & Record<'--primary', string> = {
  '--primary': 'oklch(0.646 0.222 41.116)',
};

const meta: Meta<typeof GridColumnSlider> = {
  title: 'UI/GridColumnSlider',
  component: GridColumnSlider,
  args: {
    value: 5,
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="relative h-40 w-[420px] bg-gray-100 dark:bg-neutral-950">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GridColumnSlider>;

export const Default: Story = {};

export const Active: Story = {
  args: {
    value: 12,
  },
};

export const WithBadge: Story = {
  args: {
    value: 8,
    badgeLabel: 'custom',
  },
};

export const ThemedPrimary: Story = {
  args: {
    value: 10,
    badgeLabel: 'primary',
  },
  render: (args) => (
    <div style={themedPrimaryStyle}>
      <GridColumnSlider {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    value: 2,
    disabled: true,
  },
};

export const Loading: Story = {
  args: {
    value: 5,
    loading: true,
  },
};

export const Interactive: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value ?? 5);
    const handleChange = useCallback((nextValue: number) => {
      setValue(nextValue);
    }, []);

    return <GridColumnSlider {...args} value={value} onChange={handleChange} />;
  },
};
