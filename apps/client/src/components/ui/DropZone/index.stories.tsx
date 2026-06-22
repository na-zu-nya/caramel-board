import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DropZone, DropZoneScanProgressCard } from '.';

type DropEventLog = {
  id: string;
  message: string;
};

const meta: Meta<typeof DropZone> = {
  title: 'UI/DropZone',
  component: DropZone,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof DropZone>;

export const Default: Story = {
  render: () => {
    const [logs, setLogs] = useState<DropEventLog[]>([]);

    const pushLog = (message: string) =>
      setLogs((prev) => [{ id: crypto.randomUUID(), message }, ...prev].slice(0, 5));

    return (
      <DropZone
        onDrop={(files) => pushLog(`${files.length}件のファイルを受け取りました`)}
        onUrlDrop={(urls) => pushLog(`${urls.length}件のURLを受け取りました`)}
        className="w-[480px]"
      >
        <div className="border border-dashed border-gray-400 rounded-xl px-8 py-10 text-center space-y-4 bg-white">
          <p className="text-lg font-semibold text-gray-800">ここにファイルや画像URLをドロップ</p>
          <p className="text-sm text-gray-500">
            Finderやローカルファイルはもちろん、SVG / PDF互換AI /
            画像URLのドロップもテストできます。
          </p>
          <p className="text-xs text-gray-400">
            ファイルが取得できる場合はファイルを優先し、取得できないときだけ複数URLを処理します。
          </p>
          <p className="text-xs text-gray-400">
            `text/plain` / `text/uri-list` の改行区切りに加えて、Safari 系の連結URLも吸収します。
          </p>
          <p className="text-xs text-gray-400">
            ドロップ時には `console` に `DataTransfer` の生ペイロードも種類別で出力されます。
          </p>
          <p className="text-xs text-gray-400">
            `dragover` では `dropEffect = copy` を明示し、Cmd 併用時の再投入も検証できます。
          </p>
          <div className="text-left text-xs text-gray-500 space-y-1">
            {logs.map((log) => (
              <div key={log.id}>• {log.message}</div>
            ))}
          </div>
        </div>
      </DropZone>
    );
  },
};

export const ScanningFolder: Story = {
  render: () => (
    <div className="w-[480px] space-y-4">
      <DropZone
        onDrop={() => undefined}
        scanProgress={{
          fileCount: 12840,
          directoryCount: 42,
          currentPath: 'Reference/Characters/pose-library/standing/front-001.png',
        }}
      >
        <div className="rounded-xl border border-dashed border-gray-400 bg-white px-8 py-10 text-center">
          <p className="text-lg font-semibold text-gray-800">フォルダ走査中の表示</p>
        </div>
      </DropZone>
      <DropZoneScanProgressCard
        progress={{
          fileCount: 12840,
          directoryCount: 42,
          currentPath: 'Reference/Characters/pose-library/standing/front-001.png',
        }}
      />
    </div>
  ),
};
