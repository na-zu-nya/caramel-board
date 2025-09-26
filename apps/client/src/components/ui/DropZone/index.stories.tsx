import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DropZone } from '.';

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
            Finderやローカルファイルはもちろん、X / Pixiv などからの画像ドロップもテストできます。
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
