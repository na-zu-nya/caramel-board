import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Grid3x3,
  Keyboard,
  Layers,
  MousePointer,
  Search,
  SidebarOpen,
  Sparkles,
  Star,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CARAMEL_COLOR } from '@/components/ui/LibraryCard';
import { LibrarySetupForm } from '@/components/ui/LibrarySetupForm';
import { SetupGuide } from '@/components/ui/SetupGuide';
import { useBootstrapNavigationPins } from '@/hooks/useBootstrapNavigationPins';
import { useCreateDataset, useDatasets } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';

export interface SetupPageContainerProps {
  preview?: boolean;
}

export function SetupPageContainer({ preview = false }: SetupPageContainerProps) {
  const { data: datasets = [], isLoading } = useDatasets();
  const createDataset = useCreateDataset();
  const bootstrapNavigationPins = useBootstrapNavigationPins();
  const navigate = useNavigate();

  useHeaderActions(
    useMemo(
      () => ({
        showShuffle: false,
        showFilter: false,
        showSelection: false,
      }),
      []
    )
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📚');
  const [color, setColor] = useState(DEFAULT_CARAMEL_COLOR);
  const [error, setError] = useState<string | null>(null);
  const createStepIndexRef = useRef(0);

  const isFirstLibrary = (datasets?.length ?? 0) === 0;
  const isSubmitting = createDataset.isPending;

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ライブラリ名を入力してください');
      setActiveIndex(createStepIndexRef.current);
      return;
    }

    try {
      setError(null);
      const created = await createDataset.mutateAsync({
        name: trimmed,
        icon,
        themeColor: color,
      });

      if (!preview) {
        await bootstrapNavigationPins(created.id, { setAsDefault: isFirstLibrary });
      }

      await navigate({ to: '/library/$datasetId', params: { datasetId: String(created.id) } });
    } catch (err) {
      console.error('Failed to create the first library', err);
      setError('ライブラリの作成に失敗しました。時間をおいて再試行してください。');
      setActiveIndex(createStepIndexRef.current);
    }
  }, [
    name,
    icon,
    color,
    createDataset,
    isFirstLibrary,
    bootstrapNavigationPins,
    navigate,
    preview,
  ]);

  useEffect(() => {
    if (!preview && !isLoading && !isFirstLibrary) {
      void navigate({ to: '/' });
    }
  }, [preview, isLoading, isFirstLibrary, navigate]);

  const steps = useMemo(() => {
    return [
      {
        id: 'intro',
        title: 'ようこそ！',
        description: 'CaramelBoardで、あなたの創作活動をもっと楽しく、もっと効率的に。',
        illustration: (
          <div className="relative mx-auto h-64 w-full max-w-md">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-300/20 to-pink-400/20 rounded-3xl blur-3xl" />
            <div className="relative flex h-full items-center justify-center">
              <div className="grid grid-cols-3 gap-4">
                <div className="h-20 w-20 rounded-2xl bg-white shadow-xl flex items-center justify-center transform -rotate-6 hover:rotate-0 transition-transform">
                  <BookOpen className="h-10 w-10 text-purple-600" />
                </div>
                <div className="h-20 w-20 rounded-2xl bg-white shadow-xl flex items-center justify-center transform rotate-3 hover:rotate-0 transition-transform">
                  <Layers className="h-10 w-10 text-pink-500" />
                </div>
                <div className="h-20 w-20 rounded-2xl bg-white shadow-xl flex items-center justify-center transform -rotate-3 hover:rotate-0 transition-transform">
                  <Star className="h-10 w-10 text-yellow-500" />
                </div>
              </div>
            </div>
          </div>
        ),
        content: (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                <Layers className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">複数ライブラリで整理</h4>
                <p className="text-sm text-gray-600">
                  参考資料、作品集、素材集など、用途別に分けて管理
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 text-pink-600">
                <Grid3x3 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">ビジュアルグリッド表示</h4>
                <p className="text-sm text-gray-600">画像や動画をタイル状に一覧表示</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">スマートな管理機能</h4>
                <p className="text-sm text-gray-600">タグ、色、お気に入りで素早く検索</p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'features',
        title: 'できること',
        description: 'CaramelBoardの主要機能を紹介します。',
        illustration: (
          <div className="space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white">
              <Search className="mb-3 h-8 w-8" />
              <h4 className="font-semibold">高度な検索</h4>
              <p className="mt-1 text-sm opacity-90">タグ、色、メタデータで瞬時に検索</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white">
                <Sparkles className="mb-3 h-6 w-6" />
                <h4 className="font-semibold">簡単整理</h4>
                <p className="mt-1 text-sm opacity-90">タグ付けとお気に入り</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 p-6 text-white">
                <BookOpen className="mb-3 h-6 w-6" />
                <h4 className="font-semibold">便利なビューア</h4>
                <p className="mt-1 text-sm opacity-90">スタックで一括閲覧</p>
              </div>
            </div>
          </div>
        ),
        content: (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-medium text-gray-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" />
                複数のライブラリ
              </h4>
              <p className="text-sm text-gray-600">
                用途別にライブラリを分けて、プロジェクトごとに整理
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-medium text-gray-900 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-indigo-600" />
                便利なビューア
              </h4>
              <p className="text-sm text-gray-600">
                複数の画像や動画をグループ化して、まとめて閲覧可能
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-medium text-gray-900 flex items-center gap-2">
                <Star className="h-4 w-4 text-pink-500" />
                お気に入りとLike
              </h4>
              <p className="text-sm text-gray-600">
                重要なアイテムをお気に入り登録、Likeカウントで人気度を管理
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-medium text-gray-900 flex items-center gap-2">
                <MousePointer className="h-4 w-4 text-emerald-500" />
                ドラッグ&ドロップ
              </h4>
              <p className="text-sm text-gray-600">
                ファイルを直接ドロップしてアップロード、順番の入れ替えも簡単
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'shortcuts',
        title: 'ショートカット',
        description: 'キーボードショートカットで素早い操作を実現。',
        illustration: (
          <div className="relative mx-auto flex h-48 w-full max-w-sm items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/10 to-purple-400/10 rounded-3xl" />
            <Keyboard className="h-32 w-32 text-indigo-400" />
          </div>
        ),
        content: (
          <div className="space-y-6">
            {/* グローバル */}
            <div>
              <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-purple-500 rounded-full"></span>
                グローバル
              </h5>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-amber-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-base font-bold text-gray-900">Q</p>
                      <p className="text-sm text-gray-600">サイドバー開閉</p>
                    </div>
                    <SidebarOpen className="h-5 w-5 text-gray-400 group-hover:text-purple-600" />
                  </div>
                </div>
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-amber-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-base font-bold text-gray-900">E</p>
                      <p className="text-sm text-gray-600">情報パネル開閉</p>
                    </div>
                    <div className="h-5 w-5 rounded border border-gray-400 group-hover:border-purple-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* リストページ */}
            <div>
              <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-orange-500 rounded-full"></span>
                リストページ
              </h5>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-orange-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-base font-bold text-gray-900">F</p>
                      <p className="text-sm text-gray-600">検索パネル開閉</p>
                    </div>
                    <Search className="h-5 w-5 text-gray-400 group-hover:text-orange-600" />
                  </div>
                </div>
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-orange-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs font-bold text-gray-900">⌘/Ctrl+Click</p>
                      <p className="text-sm text-gray-600">複数選択</p>
                    </div>
                    <MousePointer className="h-5 w-5 text-gray-400 group-hover:text-orange-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* ビューアページ */}
            <div>
              <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full"></span>
                ビューアページ
              </h5>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-yellow-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-base font-bold text-gray-900">← →</p>
                      <p className="text-sm text-gray-600">ページ送り</p>
                    </div>
                    <div className="flex gap-1">
                      <ArrowLeft className="h-5 w-5 text-gray-400 group-hover:text-yellow-600" />
                      <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-yellow-600" />
                    </div>
                  </div>
                </div>
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-yellow-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-base font-bold text-gray-900">S</p>
                      <p className="text-sm text-gray-600">シャッフル</p>
                    </div>
                    <div className="h-5 w-5 rounded border-2 border-dashed border-gray-400 group-hover:border-yellow-600" />
                  </div>
                </div>
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-yellow-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-base font-bold text-gray-900">N</p>
                      <p className="text-sm text-gray-600">書き込みツール</p>
                    </div>
                    <div className="h-5 w-5 rounded-full border-2 border-gray-400 group-hover:border-yellow-600" />
                  </div>
                </div>
                <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-yellow-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs font-bold text-gray-900">⌘/Ctrl</p>
                      <p className="text-sm text-gray-600">画像ドラッグ</p>
                    </div>
                    <MousePointer className="h-5 w-5 text-gray-400 group-hover:text-yellow-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'create',
        title: '準備完了！',
        description: '最初のライブラリを作成して、CaramelBoardを始めましょう。',
        content: (
          <LibrarySetupForm
            name={name}
            icon={icon}
            color={color}
            description="最初のライブラリには、お気に入り・画像・コミック・動画のピンが自動で追加されます。 名前や設定は後から変更できます。"
            onNameChange={setName}
            onIconChange={setIcon}
            onColorChange={setColor}
            onSubmit={() => {
              void handleCreate();
            }}
            submitting={isSubmitting}
            disabled={isSubmitting}
            error={error ?? undefined}
            focusOnMount={activeIndex === createStepIndexRef.current}
          />
        ),
      },
    ];
  }, [activeIndex, name, icon, color, isSubmitting, error, handleCreate]);

  const createStepIndex = useMemo(() => steps.findIndex((step) => step.id === 'create'), [steps]);

  useEffect(() => {
    if (createStepIndex >= 0) {
      createStepIndexRef.current = createStepIndex;
    } else if (steps.length > 0) {
      createStepIndexRef.current = steps.length - 1;
    } else {
      createStepIndexRef.current = 0;
    }
  }, [createStepIndex, steps.length]);

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-amber-50 via-white to-orange-50 pointer-events-none" />
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgb3BhY2l0eT0iMC4wMyIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50 pointer-events-none" />

      <div className="relative mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
        <SetupGuide
          steps={steps}
          activeIndex={activeIndex}
          onRequestPrev={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
          onRequestNext={() => setActiveIndex((prev) => Math.min(prev + 1, steps.length - 1))}
          onStepSelect={(index) => setActiveIndex(index)}
        />
      </div>
    </div>
  );
}

export default SetupPageContainer;
