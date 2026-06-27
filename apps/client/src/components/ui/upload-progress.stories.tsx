import type { Meta, StoryObj } from '@storybook/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { useMemo } from 'react';
import { currentBatchAtom, type UploadFile, uploadNotificationsAtom } from '@/stores/upload';
import { UploadProgress } from './upload-progress';

const meta: Meta<typeof UploadProgress> = {
  title: 'UI/UploadProgress',
  component: UploadProgress,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof UploadProgress>;

function createUploadFile(id: string, status: UploadFile['status'], progress: number): UploadFile {
  return {
    id,
    file: new File(['demo'], `${id}.png`, { type: 'image/png' }),
    progress,
    status,
  };
}

function UploadProgressStory() {
  const store = useMemo(() => {
    const storyStore = createStore();
    storyStore.set(currentBatchAtom, {
      id: 'story-batch',
      type: 'new-stack',
      files: [
        createUploadFile('completed', 'completed', 100),
        createUploadFile('uploading', 'uploading', 48),
        createUploadFile('pending', 'pending', 0),
      ],
    });
    storyStore.set(uploadNotificationsAtom, [
      {
        id: 'success',
        type: 'success',
        message: '3 件のファイルを追加しました。',
        timestamp: Date.now(),
      },
      {
        id: 'info',
        type: 'info',
        message: 'アップロードキューを処理しています。',
        timestamp: Date.now(),
      },
    ]);
    return storyStore;
  }, []);

  return (
    <JotaiProvider store={store}>
      <div className="min-h-screen bg-gray-100" />
      <UploadProgress />
    </JotaiProvider>
  );
}

function PendingUploadProgressStory() {
  const store = useMemo(() => {
    const storyStore = createStore();
    storyStore.set(currentBatchAtom, {
      id: 'story-pending-batch',
      type: 'new-stack',
      files: [
        createUploadFile('pending-1', 'pending', 0),
        createUploadFile('pending-2', 'pending', 0),
        createUploadFile('pending-3', 'pending', 0),
      ],
    });
    return storyStore;
  }, []);

  return (
    <JotaiProvider store={store}>
      <div className="min-h-screen bg-gray-100" />
      <UploadProgress />
    </JotaiProvider>
  );
}

export const Default: Story = {
  render: () => <UploadProgressStory />,
};

export const Pending: Story = {
  render: () => <PendingUploadProgressStory />,
};

export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile2',
    },
  },
  render: () => <UploadProgressStory />,
};
