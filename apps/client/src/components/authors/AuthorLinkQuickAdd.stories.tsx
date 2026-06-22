import type { Meta, StoryObj } from '@storybook/react';
import { Pencil } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { AuthorLinkQuickAdd } from './AuthorLinkQuickAdd';

const meta: Meta<typeof AuthorLinkQuickAdd> = {
  title: 'Authors/AuthorLinkQuickAdd',
  component: AuthorLinkQuickAdd,
  args: {
    open: false,
    addLabel: 'リンクを追加',
    urlLabel: 'URL',
    urlPlaceholder: 'https://...',
    submitLabel: 'リンクを追加',
    submitting: false,
  },
};

export default meta;
type Story = StoryObj<typeof AuthorLinkQuickAdd>;

function AuthorLinkQuickAddStory(args: ComponentProps<typeof AuthorLinkQuickAdd>) {
  const [open, setOpen] = useState(args.open);

  return (
    <div className="min-h-56 bg-gray-50 p-6">
      <AuthorLinkQuickAdd
        {...args}
        open={open}
        onOpenChange={setOpen}
        onSubmit={() => setOpen(false)}
      />
    </div>
  );
}

export const Default: Story = {
  render: (args) => <AuthorLinkQuickAddStory {...args} />,
};

export const Edit: Story = {
  args: {
    addLabel: 'Pixiv',
    submitLabel: '更新',
    initialUrl: 'https://www.pixiv.net/users/123456',
    showPrefix: false,
    triggerTitle: 'リンクを編集',
  },
  render: (args) => <AuthorLinkQuickAddStory {...args} />,
};

export const EditIconOnly: Story = {
  args: {
    addLabel: 'リンクを編集',
    submitLabel: '更新',
    initialUrl: 'https://www.pixiv.net/users/123456',
    showPrefix: false,
    showTriggerLabel: false,
    triggerIcon: <Pencil size={11} />,
    triggerTitle: 'リンクを編集',
    triggerClassName:
      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600',
  },
  render: (args) => <AuthorLinkQuickAddStory {...args} />,
};
