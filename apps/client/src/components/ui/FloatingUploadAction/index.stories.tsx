import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FloatingUploadAction } from '.';

const meta: Meta<typeof FloatingUploadAction> = {
  title: 'UI/FloatingUploadAction',
  component: FloatingUploadAction,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof FloatingUploadAction>;

export const Floating: Story = {
  render: () => {
    const [message, setMessage] = useState('未追加');

    return (
      <div className="relative h-80 w-96 rounded-lg bg-gray-100">
        <FloatingUploadAction
          className="absolute bottom-4 left-4"
          onFiles={(files) => setMessage(`${files.length}件のファイル`)}
          onUrls={(urls) => setMessage(`${urls.length}件のURL`)}
        />
        <div className="absolute left-5 top-5 rounded-md bg-white px-3 py-2 text-sm text-gray-700 shadow">
          {message}
        </div>
      </div>
    );
  },
};

export const Toolbar: Story = {
  render: () => (
    <div className="relative h-48 w-96 rounded-lg bg-slate-900 p-6">
      <div className="absolute bottom-4 right-4 flex gap-2">
        <FloatingUploadAction
          variant="toolbar"
          onFiles={(files) => console.log('files', files)}
          onUrls={(urls) => console.log('urls', urls)}
        />
        <button type="button" className="rounded-full bg-black/40 p-3 text-white">
          A
        </button>
      </div>
    </div>
  ),
};

export const ViewerDismiss: Story = {
  render: () => (
    <div className="relative h-64 w-[42rem] rounded-lg bg-slate-900 p-6">
      <div className="absolute inset-0 grid place-items-center text-sm text-white/50">
        viewer content
      </div>
      <div className="absolute bottom-4 left-4">
        <FloatingUploadAction
          variant="toolbar"
          closeOnOutsidePointerDown
          onFiles={(files) => console.log('files', files)}
          onUrls={(urls) => console.log('urls', urls)}
        />
      </div>
    </div>
  ),
};
