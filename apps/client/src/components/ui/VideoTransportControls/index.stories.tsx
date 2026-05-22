import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { VideoTransportControls } from './index';

const meta: Meta<typeof VideoTransportControls> = {
  title: 'Components/VideoTransportControls',
  component: VideoTransportControls,
  args: {
    onPlay: () => {},
    onStepBackward: () => {},
    onStepForward: () => {},
    onShuttleStart: () => {},
    onShuttleEnd: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof VideoTransportControls>;

export const Default: Story = {
  render: (args) => (
    <div className="flex h-40 w-[520px] items-end justify-center bg-neutral-950 p-8">
      <VideoTransportControls {...args} />
    </div>
  ),
};

export const Interactive: Story = {
  render: (args) => {
    const [status, setStatus] = useState('paused');

    return (
      <div className="flex h-40 w-[520px] flex-col items-center justify-end gap-4 bg-neutral-950 p-8 text-white">
        <div className="font-mono text-xs text-white/70">{status}</div>
        <VideoTransportControls
          {...args}
          onPlay={() => setStatus('play')}
          onStepBackward={() => setStatus('step backward')}
          onStepForward={() => setStatus('step forward')}
          onShuttleStart={(direction) => setStatus(direction < 0 ? 'rewind hold' : 'forward hold')}
          onShuttleEnd={() => setStatus('paused')}
        />
      </div>
    );
  },
};
