import type { Meta, StoryObj } from '@storybook/react';
import { type ComponentProps, useState } from 'react';
import { type AuthorLinkDraft, AuthorLinkEditor } from './AuthorLinkEditor';

const meta: Meta<typeof AuthorLinkEditor> = {
  title: 'Authors/AuthorLinkEditor',
  component: AuthorLinkEditor,
  args: {
    links: [
      { id: 1, url: 'https://www.pixiv.net/users/123456' },
      { id: 2, url: 'https://www.youtube.com/@caramel' },
    ],
    copy: {
      links: 'リンク',
      url: 'URL',
      urlPlaceholder: 'https://...',
      addLink: 'リンクを追加',
      removeLink: 'リンクを削除',
      maxLinks: (count: number) => `${count} 件まで`,
    },
  },
};

export default meta;
type Story = StoryObj<typeof AuthorLinkEditor>;

function AuthorLinkEditorStory(args: ComponentProps<typeof AuthorLinkEditor>) {
  const initialLinks = Array.isArray(args.links) ? args.links : [];
  const [links, setLinks] = useState<AuthorLinkDraft[]>(initialLinks);
  return (
    <div className="max-w-2xl bg-gray-50 p-6">
      <AuthorLinkEditor {...args} links={links} onChange={setLinks} />
    </div>
  );
}

export const Default: Story = {
  render: (args) => <AuthorLinkEditorStory {...args} />,
};

export const Empty: Story = {
  args: {
    links: [],
  },
  render: (args) => <AuthorLinkEditorStory {...args} />,
};
