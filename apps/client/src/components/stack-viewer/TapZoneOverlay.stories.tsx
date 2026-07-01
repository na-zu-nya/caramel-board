import type { Meta, StoryObj } from '@storybook/react';
import TapZoneOverlay from './TapZoneOverlay';

const meta: Meta<typeof TapZoneOverlay> = {
  title: 'StackViewer/TapZoneOverlay',
  component: TapZoneOverlay,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="relative min-h-screen bg-black">
        <div className="fixed inset-x-0 top-0 z-0 h-14 border-b border-white/10 bg-white/95" />
        <div className="fixed inset-x-0 bottom-0 z-0 h-24 border-t border-white/10 bg-white/10" />
        <div className="fixed inset-0 z-0 flex items-center justify-center">
          <div className="aspect-[3/2] w-[min(70vw,760px)] rounded-lg bg-gradient-to-br from-slate-800 via-sky-900 to-amber-500" />
        </div>
        <Story />
      </div>
    ),
  ],
  args: {
    contentArea: { top: 56, left: 0, right: 0, bottom: 96 },
    onLeftTap: () => console.log('left tap'),
    onRightTap: () => console.log('right tap'),
    onCenterTap: () => console.log('center tap'),
    onDrag: (deltaX) => console.log('drag', deltaX),
    onDragEnd: (deltaX, velocity) => console.log('drag end', deltaX, velocity),
    onWheelZoom: (clientX, clientY, deltaY) => console.log('wheel zoom', clientX, clientY, deltaY),
    onPinchZoom: (clientX, clientY, scaleMultiplier) =>
      console.log('pinch zoom', clientX, clientY, scaleMultiplier),
    onZoomPan: (deltaX, deltaY) => console.log('zoom pan', deltaX, deltaY),
    onDoubleTap: () => console.log('double tap reset'),
    onAltDragStart: ({ x, y }) => {
      console.log('alt drag start', x, y);
      return true;
    },
  },
};

export default meta;

type Story = StoryObj<typeof TapZoneOverlay>;

export const Default: Story = {};

export const Zoomed: Story = {
  args: {
    isZoomed: true,
    disableDrag: true,
  },
};
