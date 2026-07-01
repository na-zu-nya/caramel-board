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
    liked: 2,
    likeCount: 2,
    orderInStack: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    stackId: 1,
    file: makeImage('02', '#7a4c8f'),
    originalName: 'page-02.png',
    favorited: true,
    isFavorite: true,
    orderInStack: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 3,
    stackId: 1,
    file: makeImage('03', '#8f5b38'),
    originalName: 'page-03.png',
    liked: 1,
    likeCount: 1,
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<Asset['id']>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<Asset['id'] | null>(null);

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

  const handleRemoveAssets = useCallback((assetIds: Array<Asset['id']>) => {
    if (!window.confirm(`Remove ${assetIds.length} selected asset(s)?`)) return;
    setAssets((current) => current.filter((item) => !assetIds.includes(item.id)));
    setSelectedAssetIds(new Set());
    setSelectionAnchorId(null);
    setIsSelectionMode(false);
  }, []);

  const handleEnterAssetSelectionMode = useCallback((assetId: Asset['id']) => {
    setIsSelectionMode(true);
    setSelectedAssetIds(new Set([assetId]));
    setSelectionAnchorId(assetId);
  }, []);

  const handleToggleAssetSelection = useCallback((assetId: Asset['id']) => {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      setSelectionAnchorId(next.size > 0 ? assetId : null);
      return next;
    });
  }, []);

  const handleSelectAssetRange = useCallback(
    (assetId: Asset['id']) => {
      const targetIndex = assets.findIndex((asset) => asset.id === assetId);
      const anchorIndex = assets.findIndex((asset) => asset.id === (selectionAnchorId ?? assetId));
      if (targetIndex < 0 || anchorIndex < 0) return;

      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const rangeIds = assets.slice(start, end + 1).map((asset) => asset.id);
      setSelectionAnchorId(assetId);
      setSelectedAssetIds((current) => new Set([...current, ...rangeIds]));
    },
    [assets, selectionAnchorId]
  );

  const handleClearAssetSelection = useCallback(() => {
    setSelectedAssetIds(new Set());
    setSelectionAnchorId(null);
    setIsSelectionMode(false);
  }, []);

  const handleToggleAssetFavorite = useCallback((assetId: Asset['id']) => {
    setAssets((current) =>
      current.map((asset) => {
        if (asset.id !== assetId) return asset;
        const nextFavorited = !(asset.favorited ?? asset.isFavorite);
        return { ...asset, favorited: nextFavorited, isFavorite: nextFavorited };
      })
    );
  }, []);

  const handleLikeAsset = useCallback((assetId: Asset['id']) => {
    setAssets((current) =>
      current.map((asset) => {
        if (asset.id !== assetId) return asset;
        const nextLikeCount = (asset.likeCount ?? asset.liked ?? 0) + 1;
        return { ...asset, liked: nextLikeCount, likeCount: nextLikeCount };
      })
    );
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          className="rounded bg-white px-3 py-1.5 text-sm text-gray-900"
          onClick={() => {
            setIsSelectionMode((current) => {
              const next = !current;
              if (!next) {
                setSelectedAssetIds(new Set());
                setSelectionAnchorId(null);
              }
              return next;
            });
          }}
        >
          {isSelectionMode ? '選択モードを終了' : '選択モードに入る'}
        </button>
      </div>
      <div className="relative h-[520px] w-[760px] overflow-hidden rounded-lg bg-gray-950">
        <AssetGrid
          assets={assets}
          currentPage={0}
          onSelectPage={() => {}}
          onSortPresetSelect={handleSortPresetSelect}
          canSortAssets={assets.length >= 2}
          onReorderAssets={setAssets}
          onRemoveAsset={handleRemoveAsset}
          onRemoveAssets={handleRemoveAssets}
          isSelectionMode={isSelectionMode}
          selectedAssetIds={isSelectionMode ? selectedAssetIds : undefined}
          onEnterAssetSelectionMode={handleEnterAssetSelectionMode}
          onToggleAssetSelection={handleToggleAssetSelection}
          onSelectAssetRange={handleSelectAssetRange}
          onClearAssetSelection={handleClearAssetSelection}
          onDownloadAssets={(assetIds) => console.log('download assets', assetIds)}
          onSeparateAssets={(assetIds) => console.log('separate assets', assetIds)}
          onCreateStackFromAssets={(assetIds) => console.log('create stack from assets', assetIds)}
          onToggleAssetFavorite={handleToggleAssetFavorite}
          onLikeAsset={handleLikeAsset}
        />
      </div>
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
