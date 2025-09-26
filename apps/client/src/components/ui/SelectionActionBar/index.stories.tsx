import type { Meta, StoryObj } from '@storybook/react';
import { Provider, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { SelectionActionBar } from '../selection-action-bar';
import { selectionModeAtom } from '@/stores/ui';
import { Clapperboard, Pencil, RefreshCw, Trash2 } from 'lucide-react';

const meta: Meta<typeof SelectionActionBar> = {
  title: 'UI/SelectionActionBar',
  component: SelectionActionBar,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof SelectionActionBar>;

const SelectionModeActivator = () => {
  const setSelectionMode = useSetAtom(selectionModeAtom);
  useEffect(() => {
    setSelectionMode(true);
    return () => setSelectionMode(false);
  }, [setSelectionMode]);
  return null;
};

export const Default: Story = {
  render: () => (
    <Provider>
      <SelectionModeActivator />
      <div className="relative h-48 w-full max-w-xl bg-slate-100 flex items-end justify-center p-8">
        <SelectionActionBar
          selectedCount={3}
          onClearSelection={() => console.log('clear selection')}
          onExitSelectionMode={() => console.log('exit selection')}
          onRemoveFromCollection={() => console.log('remove from collection')}
          showRemoveFromCollection
          actions={[
            {
              label: 'Bulk Edit',
              value: 'bulk-edit',
              onSelect: () => console.log('open bulk edit'),
              icon: <Pencil size={12} />,
              group: 'primary',
            },
            {
              label: 'Refresh Thumbnails',
              value: 'refresh-thumbnails',
              onSelect: () => console.log('refresh thumbnails'),
              icon: <RefreshCw size={12} />,
            },
            {
              label: 'Delete Stacks',
              value: 'delete-stacks',
              onSelect: () => console.log('delete stacks'),
              icon: <Trash2 size={12} />,
              confirmMessage: 'このスタックを削除します。元に戻せません。',
              destructive: true,
            },
            {
              label: 'Optimize Video',
              value: 'optimize-video',
              onSelect: () => console.log('optimize previews'),
              icon: <Clapperboard size={12} />,
            },
          ]}
        />
      </div>
    </Provider>
  ),
};
