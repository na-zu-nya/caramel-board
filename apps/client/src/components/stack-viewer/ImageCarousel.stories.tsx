import type { Meta, StoryObj } from '@storybook/react';
import type { Asset } from '@/types';
import ImageCarousel from './ImageCarousel';

const sampleImage =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0" y1="0" x2="1" y2="1"%3E%3Cstop stop-color="%231b1b1f"/%3E%3Cstop offset="0.55" stop-color="%234d6b88"/%3E%3Cstop offset="1" stop-color="%23e8b86d"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="1200" height="800" fill="url(%23g)"/%3E%3Ccircle cx="300" cy="260" r="140" fill="%23ffffff" fill-opacity="0.22"/%3E%3Crect x="520" y="180" width="420" height="300" rx="28" fill="%23000000" fill-opacity="0.28"/%3E%3Cpath d="M170 650 C360 440 560 760 750 520 S1000 470 1090 610" fill="none" stroke="%23ffffff" stroke-width="28" stroke-linecap="round" stroke-opacity="0.64"/%3E%3C/svg%3E';

const sampleVideo = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const makeAsset = (id: number): Asset => ({
  id,
  stackId: 1,
  file: sampleImage,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const makeVideoAsset = (id: number): Asset => ({
  id,
  stackId: 1,
  file: sampleVideo,
  mimeType: 'video/mp4',
  meta: {
    markers: [
      { time: 1.2, color: 'white', label: '' },
      { time: 3.6, color: 'bright-cyan', label: '' },
      { time: 5.8, color: 'bright-yellow', label: '' },
    ],
  },
  createdAt: '2026-01-01T00:00:00.000Z',
});

const makeSvgAsset = (id: number): Asset => ({
  id,
  stackId: 1,
  file: '/files/vector-reference.svg',
  originalName: 'vector-reference.svg',
  mimeType: 'image/svg+xml',
  preview: sampleImage,
  thumbnail: sampleImage,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const meta: Meta<typeof ImageCarousel> = {
  title: 'StackViewer/ImageCarousel',
  component: ImageCarousel,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="h-[420px] w-[720px] overflow-hidden rounded-lg bg-black">
        <Story />
      </div>
    ),
  ],
  args: {
    currentAsset: makeAsset(1),
    gestureTransform: { translateX: 0, translateY: 0, scale: 1, opacity: 1 },
    translateX: 0,
  },
};

export default meta;

type Story = StoryObj<typeof ImageCarousel>;

export const Default: Story = {};

export const Zoomed: Story = {
  args: {
    zoomTransform: {
      scale: 2.4,
      translateX: -120,
      translateY: 48,
    },
  },
};

export const Video: Story = {
  args: {
    currentAsset: makeVideoAsset(2),
    uiInsets: { top: 16, left: 16, right: 16 },
  },
};

export const SvgPreview: Story = {
  args: {
    currentAsset: makeSvgAsset(3),
  },
};
