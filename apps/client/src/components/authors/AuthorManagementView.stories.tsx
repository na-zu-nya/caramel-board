import type { Meta, StoryObj } from '@storybook/react';
import { useMemo, useState } from 'react';
import type { Author, MediaGridItem } from '@/types';
import { AuthorManagementView } from './AuthorManagementView';

const authors: Author[] = [
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

const authorStacks: MediaGridItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  dataSetId: 1,
  name: `Stack ${index + 1}`,
  thumbnail: `https://picsum.photos/seed/author-stack-${index + 1}/320/320`,
  mediaType: index % 3 === 0 ? 'video' : 'image',
}));

const meta: Meta<typeof AuthorManagementView> = {
  title: 'Authors/AuthorManagementView',
  component: AuthorManagementView,
};

export default meta;
type Story = StoryObj<typeof AuthorManagementView>;

function AuthorManagementViewStory({
  initialSelectedAuthorId = 1,
}: {
  initialSelectedAuthorId?: number | null;
}) {
  const [authorRecords, setAuthorRecords] = useState(authors);
  const [selectedAuthorId, setSelectedAuthorId] = useState<number | null>(initialSelectedAuthorId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<number>>(new Set([2]));
  const selectedAuthor =
    selectedAuthorId !== null
      ? (authorRecords.find((author) => author.id === selectedAuthorId) ?? null)
      : null;
  const [draftName, setDraftName] = useState(selectedAuthor?.name ?? '');

  const visibleAuthors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return authorRecords;
    return authorRecords.filter((author) => author.name.toLowerCase().includes(query));
  }, [authorRecords, searchQuery]);

  const updateSelectedAuthor = (update: (author: Author) => Author) => {
    setAuthorRecords((current) =>
      current.map((author) => (author.id === selectedAuthorId ? update(author) : author))
    );
  };

  return (
    <div className="h-[720px] overflow-hidden border bg-white">
      <AuthorManagementView
        authors={visibleAuthors}
        selectedAuthor={selectedAuthor}
        selectedAuthorId={selectedAuthorId}
        searchQuery={searchQuery}
        draftName={draftName}
        authorStacks={selectedAuthor ? authorStacks : []}
        authorStacksTotal={selectedAuthor ? authorStacks.length : 0}
        selectedMergeIds={selectedMergeIds}
        loading={false}
        authorStacksLoading={false}
        authorStacksLoadingMore={false}
        authorStacksHasMore={true}
        saving={false}
        merging={false}
        linkSubmitting={false}
        onSearchChange={setSearchQuery}
        onSelectAuthor={(authorId) => {
          const nextAuthor = authorRecords.find((author) => author.id === authorId);
          setSelectedAuthorId(authorId);
          setSelectedMergeIds(new Set());
          setDraftName(nextAuthor?.name ?? '');
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
        onAddAuthorLink={({ url }) => {
          updateSelectedAuthor((author) => ({
            ...author,
            links: [
              ...(author.links ?? []),
              {
                id: Date.now(),
                authorId: Number(author.id),
                provider: 'custom',
                label: 'Custom',
                url,
                externalId: null,
                sortOrder: author.links?.length ?? 0,
              },
            ],
          }));
        }}
        onUpdateAuthorLink={(linkId, { url }) => {
          updateSelectedAuthor((author) => ({
            ...author,
            links: (author.links ?? []).map((link) =>
              link.id === linkId
                ? {
                    ...link,
                    url,
                  }
                : link
            ),
          }));
        }}
        onRemoveAuthorLink={(linkId) => {
          updateSelectedAuthor((author) => ({
            ...author,
            links: (author.links ?? []).filter((link) => link.id !== linkId),
          }));
        }}
        onLoadMoreAuthorStacks={() => undefined}
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
          updateLink: '更新',
          editLink: 'リンクを編集',
          assignedStacks: 'この作者のスタック',
          noAssignedStacks: 'この作者に割り当てられたスタックはありません',
          loadMore: 'さらに読み込む',
          save: '保存',
          saving: '保存中...',
          mergeIntoSelected: '結合',
          merging: '結合中...',
        }}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <AuthorManagementViewStory />,
};

export const NoSelection: Story = {
  render: () => <AuthorManagementViewStory initialSelectedAuthorId={null} />,
};
