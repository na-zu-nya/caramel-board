import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import ComicPageSeekBar from './ComicPageSeekBar';

const meta: Meta<typeof ComicPageSeekBar> = {
  title: 'StackViewer/ComicPageSeekBar',
  component: ComicPageSeekBar,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-black">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ComicPageSeekBar>;

function SeekBarStory(args: React.ComponentProps<typeof ComicPageSeekBar>) {
  const [index, setIndex] = useState(args.currentIndex);
  return <ComicPageSeekBar {...args} currentIndex={index} onSeek={setIndex} />;
}

export const RightOpening: Story = {
  render: (args) => <SeekBarStory {...args} />,
  args: {
    currentIndex: 0,
    total: 24,
    openingDirection: 'right-opening',
    bookmarkIndexes: [0, 4, 11, 18],
    visible: true,
  },
};

export const LeftOpening: Story = {
  render: (args) => <SeekBarStory {...args} />,
  args: {
    currentIndex: 8,
    total: 24,
    openingDirection: 'left-opening',
    bookmarkIndexes: [2, 8, 15],
    visible: true,
  },
};

export const ShortStack: Story = {
  render: (args) => <SeekBarStory {...args} />,
  args: {
    currentIndex: 2,
    total: 6,
    openingDirection: 'right-opening',
    bookmarkIndexes: [0, 5],
    visible: true,
  },
};
