import type { Meta, StoryObj } from '@storybook/react';
import { useMemo, useState } from 'react';
import type { AuthorLinkDraft } from './AuthorLinkEditor';
import { AuthorManagementView } from './AuthorManagementView';

const authors = [
  {
    id: 1,
    name: 'Sample Artist',
    stackCount: 128,
    links: [
      {
        id: 1,
        authorId: 1,
        provider: 'pixiv',
        label: 'Pixiv',
        url: 'https://www.pixiv.net/users/123456',
        externalId: '123456',
        sortOrder: 0,
      },
      {
        id: 2,
        authorId: 1,
        provider: 'x',
        label: 'X',
        url: 'https://x.com/sample_artist',
        externalId: 'sample_artist',
        sortOrder: 1,
      },
    ],
  },
  {
    id: 2,
    name: 'Sample Artist Alt',
    stackCount: 14,
    links: [],
  },
  {
    id: 3,
    name: 'Video Channel',
    stackCount: 42,
    links: [
      {
        id: 3,
        authorId: 3,
        provider: 'youtube',
        label: 'YouTube',
        url: 'https://www.youtube.com/@video-channel',
        externalId: 'video-channel',
        sortOrder: 0,
      },
    ],
  },
];

const meta: Meta<typeof AuthorManagementView> = {
  title: 'Authors/AuthorManagementView',
  component: AuthorManagementView,
};

export default meta;
type Story = StoryObj<typeof AuthorManagementView>;

function AuthorManagementViewStory() {
  const [selectedAuthorId, setSelectedAuthorId] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<number>>(new Set([2]));
  const selectedAuthor = authors.find((author) => author.id === selectedAuthorId) ?? authors[0];
  const [draftName, setDraftName] = useState(selectedAuthor.name);
  const [draftLinks, setDraftLinks] = useState<AuthorLinkDraft[]>(
    (selectedAuthor.links ?? []).map((link) => ({
      id: link.id,
      url: link.url,
    }))
  );

  const visibleAuthors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return authors;
    return authors.filter((author) => author.name.toLowerCase().includes(query));
  }, [searchQuery]);

  return (
    <AuthorManagementView
      authors={visibleAuthors}
      selectedAuthor={selectedAuthor}
      selectedAuthorId={selectedAuthorId}
      searchQuery={searchQuery}
      draftName={draftName}
      draftLinks={draftLinks}
      selectedMergeIds={selectedMergeIds}
      loading={false}
      saving={false}
      merging={false}
      onSearchChange={setSearchQuery}
      onSelectAuthor={(authorId) => {
        const nextAuthor = authors.find((author) => author.id === authorId);
        setSelectedAuthorId(authorId);
        setSelectedMergeIds(new Set());
        setDraftName(nextAuthor?.name ?? '');
        setDraftLinks(
          (nextAuthor?.links ?? []).map((link) => ({
            id: link.id,
            url: link.url,
          }))
        );
      }}
      onToggleMergeAuthor={(authorId) => {
        setSelectedMergeIds((current) => {
          const next = new Set(current);
          if (next.has(authorId)) {
            next.delete(authorId);
          } else {
            next.add(authorId);
          }
          return next;
        });
      }}
      onDraftNameChange={setDraftName}
      onDraftLinksChange={setDraftLinks}
      onSave={() => undefined}
      onMerge={() => undefined}
      copy={{
        title: '作者一覧',
        searchPlaceholder: '作者名・ID・リンクを検索...',
        loading: '作者を読み込み中...',
        noAuthors: '作者が見つかりません',
        noAuthorSelected: '作者を選択してください',
        authorCount: (count: number) => `${count.toLocaleString()} 件の作者`,
        stackCount: (count: number) => `${count.toLocaleString()} スタック`,
        selectedForMerge: (count: number) => `${count.toLocaleString()} 件を結合`,
        mergeCandidate: '結合対象に追加',
        selectedMergeCandidate: '結合対象に選択中',
        name: '名前',
        links: 'リンク',
        linkUrl: 'URL',
        linkUrlPlaceholder: 'https://...',
        addLink: 'リンクを追加',
        removeLink: 'リンクを削除',
        maxLinks: (count: number) => `${count} 件まで`,
        openLink: 'リンクを開く',
        save: '保存',
        saving: '保存中...',
        mergeIntoSelected: '結合',
        merging: '結合中...',
      }}
    />
  );
}

export const Default: Story = {
  render: () => <AuthorManagementViewStory />,
};
