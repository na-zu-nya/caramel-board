import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useState } from 'react';
import type { Asset } from '@/types';
import AssetGrid from './AssetGrid';
import type { AssetSortPreset } from './StackToolbar';

const makeImage = (label: string, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
      <rect width="800" height="800" fill="${color}"/>
      <rect x="80" y="80" width="640" height="640" rx="32" fill="rgba(255,255,255,0.14)"/>
      <text x="400" y="430" text-anchor="middle" font-family="system-ui, sans-serif" font-size="96" font-weight="700" fill="white">${label}</text>
    </svg>
  `)}`;

const initialAssets: Asset[] = [
  {
    id: 1,
    stackId: 1,
    file: makeImage('01', '#385f8f'),
    originalName: 'page-01.png',
    orderInStack: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    stackId: 1,
    file: makeImage('02', '#7a4c8f'),
    originalName: 'page-02.png',
    orderInStack: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 3,
    stackId: 1,
    file: makeImage('03', '#8f5b38'),
    originalName: 'page-03.png',
    orderInStack: 2,
    createdAt: '2026-01-03T00:00:00.000Z',
  },
  {
    id: 4,
    stackId: 1,
    file: makeImage('04', '#3f7a5a'),
    originalName: 'page-04.png',
    orderInStack: 3,
    createdAt: '2026-01-04T00:00:00.000Z',
  },
];

const sortAssets = (assets: Asset[], preset: AssetSortPreset) => {
  const sorted = assets.slice();
  sorted.sort((left, right) => {
    const leftName = left.originalName ?? '';
    const rightName = right.originalName ?? '';
    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    switch (preset) {
      case 'filename-desc':
        return rightName.localeCompare(leftName, undefined, { numeric: true });
      case 'created-asc':
        return leftCreatedAt - rightCreatedAt;
      case 'created-desc':
        return rightCreatedAt - leftCreatedAt;
      default:
        return leftName.localeCompare(rightName, undefined, { numeric: true });
    }
  });
  return sorted.map((asset, index) => ({ ...asset, orderInStack: index }));
};

function AssetGridStory() {
  const [assets, setAssets] = useState(initialAssets);

  const handleSortPresetSelect = useCallback((preset: AssetSortPreset) => {
    setAssets((current) => sortAssets(current, preset));
  }, []);

  const handleRemoveAsset = useCallback(
    (assetId: string | number) => {
      const asset = assets.find((item) => item.id === assetId);
      if (!window.confirm(`Remove ${asset?.originalName ?? assetId}?`)) return;
      setAssets((current) => current.filter((item) => item.id !== assetId));
    },
    [assets]
  );

  return (
    <div className="relative h-[520px] w-[760px] overflow-hidden rounded-lg bg-gray-950">
      <AssetGrid
        assets={assets}
        currentPage={0}
        onSelectPage={() => {}}
        onSortPresetSelect={handleSortPresetSelect}
        canSortAssets={assets.length >= 2}
        onReorderAssets={setAssets}
        onRemoveAsset={handleRemoveAsset}
      />
    </div>
  );
}

const meta: Meta<typeof AssetGrid> = {
  title: 'StackViewer/AssetGrid',
  component: AssetGrid,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
};

export default meta;

type Story = StoryObj<typeof AssetGrid>;

export const Default: Story = {
  render: () => <AssetGridStory />,
};
