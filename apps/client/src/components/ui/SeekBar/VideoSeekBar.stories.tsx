import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import type { VideoMarker } from '@/types';
import VideoSeekBar from './VideoSeekBar';

const meta: Meta<typeof VideoSeekBar> = {
  title: 'Components/VideoSeekBar',
  component: VideoSeekBar,
  args: {
    currentTime: 42,
    duration: 180,
    muted: false,
    volume: 0.8,
    fps: 30,
  },
};

export default meta;
type Story = StoryObj<typeof VideoSeekBar>;

export const Default: Story = {
  args: {
    onSeek: () => {},
  },
  render: (args) => (
    <div className="w-[720px] bg-neutral-900 p-6">
      <VideoSeekBar {...args} />
    </div>
  ),
};

export const WithMarkerActions: Story = {
  render: (args) => {
    const [currentTime, setCurrentTime] = useState(args.currentTime ?? 42);
    const [volume, setVolume] = useState(args.volume ?? 0.8);
    const [markers, setMarkers] = useState<VideoMarker[]>([
      { time: 24, color: 'white', label: '' },
      { time: 64, color: 'bright-cyan', label: '' },
      { time: 122, color: 'bright-yellow', label: '' },
    ]);

    return (
      <div className="w-[720px] bg-neutral-900 p-6">
        <VideoSeekBar
          {...args}
          currentTime={currentTime}
          volume={volume}
          onVolumeChange={setVolume}
          markers={markers}
          onSeek={setCurrentTime}
          onEditMarkerRequest={(marker) => setCurrentTime(marker.time)}
          onMoveMarkerRequest={(index, time) => {
            setMarkers((prev) =>
              prev
                .map((marker, markerIndex) =>
                  markerIndex === index ? { ...marker, time } : marker
                )
                .sort((left, right) => left.time - right.time)
            );
          }}
          onDeleteMarkerRequest={(index) => {
            setMarkers((prev) => prev.filter((_, markerIndex) => markerIndex !== index));
          }}
          onChangeMarkerColorRequest={(index, color) => {
            setMarkers((prev) =>
              prev.map((marker, markerIndex) =>
                markerIndex === index ? { ...marker, color } : marker
              )
            );
          }}
        />
      </div>
    );
  },
};
