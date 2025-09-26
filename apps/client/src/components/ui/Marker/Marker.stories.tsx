import type { Meta, StoryObj } from '@storybook/react';
import { Marker } from './Marker';

const meta: Meta<typeof Marker> = {
  title: 'Components/Marker',
  component: Marker,
  args: {
    color: 'bright-blue',
    size: 12,
  },
  argTypes: {
    color: {
      control: 'select',
      options: [
        'light-gray',
        'bright-red',
        'bright-orange',
        'bright-yellow',
        'bright-green',
        'bright-cyan',
        'bright-blue',
        'bright-violet',
        'sakura',
        'pink',
        'hard-pink',
        'skyblue',
        '#EAB308',
      ],
    },
    size: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof Marker>;

export const Default: Story = {};

export const HoverScale: Story = {
  render: (args) => (
    <div className="inline-block p-6 bg-gray-50 rounded-md">
      <div className="group relative w-24 h-10 border border-dashed border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500">
        Hover here
        <div className="absolute left-1/2 -translate-x-1/2 transition-transform duration-200 ease-out group-hover:scale-[1.4] will-change-transform">
          <Marker {...args} />
        </div>
      </div>
    </div>
  ),
  args: { color: 'bright-yellow' },
};

export const Palette: Story = {
  render: () => {
    const colors = [
      'light-gray',
      'bright-red',
      'bright-orange',
      'bright-yellow',
      'bright-green',
      'bright-cyan',
      'bright-blue',
      'bright-violet',
      'hard-pink',
      'sakura',
      'pink',
      'skyblue',
    ] as const;
    return (
      <div className="grid grid-cols-6 gap-6">
        {colors.map((c) => (
          <div key={c} className="flex items-center gap-3">
            <Marker color={c} />
            <span className="text-sm text-gray-600">{c}</span>
          </div>
        ))}
      </div>
    );
  },
};

