import type { Meta, StoryObj } from '@storybook/react';
import { type ComponentProps, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AddAuthorLinkDialog } from './AddAuthorLinkDialog';

const meta: Meta<typeof AddAuthorLinkDialog> = {
  title: 'Authors/AddAuthorLinkDialog',
  component: AddAuthorLinkDialog,
  args: {
    open: true,
    authorName: 'Sample Author',
    title: '作者リンクを追加',
    description: '{author} のリンクを追加します。',
    urlLabel: 'URL',
    urlPlaceholder: 'https://...',
    cancelLabel: 'キャンセル',
    submitLabel: 'リンクを追加',
    submitting: false,
  },
};

export default meta;
type Story = StoryObj<typeof AddAuthorLinkDialog>;

function AddAuthorLinkDialogStory(args: ComponentProps<typeof AddAuthorLinkDialog>) {
  const [open, setOpen] = useState(args.open);

  return (
    <div className="bg-gray-50 p-6">
      <Button type="button" onClick={() => setOpen(true)}>
        Open
      </Button>
      <AddAuthorLinkDialog
        {...args}
        open={open}
        onOpenChange={setOpen}
        onSubmit={() => setOpen(false)}
      />
    </div>
  );
}

export const Default: Story = {
  render: (args) => <AddAuthorLinkDialogStory {...args} />,
};
