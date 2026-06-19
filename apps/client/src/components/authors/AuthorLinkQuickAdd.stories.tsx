import type { Meta, StoryObj } from '@storybook/react';
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
