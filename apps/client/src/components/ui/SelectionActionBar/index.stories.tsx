import type { Meta, StoryObj } from '@storybook/react';
import { Provider, useSetAtom } from 'jotai';
import {
  Download,
  Folder,
  FolderPlus,
  GitMerge,
  NotebookText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect } from 'react';
import { selectionModeAtom } from '@/stores/ui';
import { SelectionActionBar } from '../selection-action-bar';

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
          actions={[
            {
              label: '一括編集',
              value: 'bulk-edit',
              onSelect: () => console.log('open bulk edit'),
              icon: <Pencil size={12} />,
              group: 'primary',
            },
            {
              label: '3件をダウンロード',
              value: 'download-selected',
              onSelect: () => console.log('download selected'),
              icon: <Download size={12} />,
              group: 'primary',
            },
            {
              label: 'リフレッシュ',
              value: 'refresh',
              onSelect: () => console.log('refresh'),
              icon: <RefreshCw size={12} />,
              group: 'primary',
            },
            {
              label: 'スクラッチに追加',
              value: 'add-to-scratch',
              onSelect: () => console.log('add to scratch'),
              icon: <NotebookText size={12} />,
              group: 'secondary',
            },
            {
              label: 'コレクションに追加',
              value: 'add-to-collection',
              icon: <FolderPlus size={12} />,
              group: 'secondary',
              children: [
                {
                  label: '新規コレクション',
                  value: 'create-new-collection',
                  onSelect: () => console.log('create collection'),
                  icon: <Plus size={12} />,
                },
                {
                  label: '資料',
                  value: 'collection-folder-1',
                  icon: <Folder size={12} />,
                  children: [
                    {
                      label: '参考画像',
                      value: 'collection-1',
                      onSelect: () => console.log('add to collection'),
                    },
                  ],
                },
              ],
            },
            {
              label: 'スタックをマージ',
              value: 'merge-stacks',
              onSelect: () => console.log('merge stacks'),
              icon: <GitMerge size={12} />,
              confirmMessage: '選択順の先頭スタックに残りをマージします。実行しますか？',
              group: 'secondary',
            },
            {
              label: 'コレクションから削除',
              value: 'remove-from-collection',
              onSelect: () => console.log('remove from collection'),
              icon: <Trash2 size={12} />,
              destructive: true,
            },
            {
              label: 'スタックを削除',
              value: 'delete-stacks',
              onSelect: () => console.log('delete stacks'),
              icon: <Trash2 size={12} />,
              confirmMessage: '選択したスタックを削除します。元に戻せません。',
              destructive: true,
            },
          ]}
        />
      </div>
    </Provider>
  ),
};
