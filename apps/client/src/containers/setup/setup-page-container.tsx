import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  ArrowRight,
  Check,
  ExternalLink,
  Film,
  FolderHeart,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Maximize2,
  Plus,
  Star,
  Tags,
  Upload,
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StackViewer from '@/components/stack-viewer/StackViewer';
import { Button } from '@/components/ui/button';
import { CaramelBoardLogo } from '@/components/ui/CaramelBoardLogo';
import { DEFAULT_CARAMEL_COLOR } from '@/components/ui/LibraryCard';
import { LibrarySetupForm } from '@/components/ui/LibrarySetupForm';
import { SetupGuide } from '@/components/ui/SetupGuide';
import { useBootstrapNavigationPins } from '@/hooks/useBootstrapNavigationPins';
import { useCreateDataset, useDatasets } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { infoSidebarOpenAtom } from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { MediaType } from '@/types';

const HELP_URL = 'https://github.com/na-zu-nya/caramel-board';
const MAX_FILES_PER_DROP = 4;

export interface SetupPageContainerProps {
  preview?: boolean;
}

interface TutorialUpload {
  key: string;
  previewUrl: string;
  fileName: string;
  stackId: string | number;
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** 達成したらチェックが付くチュートリアルのチェックリスト */
function TutorialChecklist({
  items,
  variant = 'card',
}: {
  items: ChecklistItem[];
  variant?: 'card' | 'overlay';
}) {
  if (variant === 'overlay') {
    return (
      <div className="space-y-1.5 rounded-2xl bg-black/65 p-3 backdrop-blur-md">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-2.5 text-xs transition-colors duration-300',
              item.done ? 'text-emerald-300' : 'text-white/85'
            )}
          >
            <span
              key={`${item.id}-${item.done}`}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                item.done
                  ? 'setup-pop-in border-emerald-400 bg-emerald-400 text-black/70'
                  : 'border-white/40 text-transparent'
              )}
            >
              <Check className="h-3 w-3" />
            </span>
            <span className={item.done ? 'line-through opacity-80' : ''}>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-all duration-300',
            item.done
              ? 'border-[#D4ECDC] bg-[#F0FAF3] text-[#2F7A4D]'
              : 'border-[#F0DFC8] bg-[#FFFBF5] text-[#6B4E33]'
          )}
        >
          <span
            key={`${item.id}-${item.done}`}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              item.done
                ? 'setup-pop-in border-[#3E9D63] bg-[#3E9D63] text-white'
                : 'border-[#E2C4A2] bg-white text-transparent'
            )}
          >
            <Check className="h-4 w-4" />
          </span>
          <span className={item.done ? 'line-through opacity-70' : ''}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

interface MiniLibraryProps {
  libraryName: string;
  libraryIcon: string;
  uploads: TutorialUpload[];
  uploading: boolean;
  dropEnabled: boolean;
  onFiles?: (files: File[]) => void;
  onTileClick?: (index: number) => void;
}

/** ページ全体を簡易に模したミニUI。チュートリアルのドロップ先・クリック対象になる */
function MiniLibrary({
  libraryName,
  libraryIcon,
  uploads,
  uploading,
  dropEnabled,
  onFiles,
  onTileClick,
}: MiniLibraryProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      if (!dropEnabled || !onFiles) return;
      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      );
      if (files.length > 0) onFiles(files.slice(0, MAX_FILES_PER_DROP));
    },
    [dropEnabled, onFiles]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[#F0DFC8] bg-white shadow-[0_14px_36px_-18px_rgba(199,116,60,0.4)]">
      {/* ウィンドウ風ヘッダー */}
      <div className="flex items-center gap-2 border-b border-[#F3E3CF] bg-[#FFF3E6] px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
        <span className="ml-3 text-xs font-semibold text-[#8A6A4F]">
          {libraryIcon} {libraryName || 'マイライブラリ'}
        </span>
      </div>
      <div className="flex">
        {/* サイドバー(雰囲気だけ) */}
        <div className="hidden w-36 shrink-0 flex-col gap-1 border-r border-[#F3E3CF] bg-[#FFFBF5] p-3 sm:flex">
          <span className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[#8A6A4F]">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            お気に入り
          </span>
          <span className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[#8A6A4F]">
            <Heart className="h-3.5 w-3.5 text-pink-500" />
            Like
          </span>
          <span className="flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-bold text-[#46301D] shadow-sm">
            <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
            画像
          </span>
          <span className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[#8A6A4F]">
            <Film className="h-3.5 w-3.5 text-purple-500" />
            ビデオ
          </span>
        </div>

        {/* グリッド領域(ドロップターゲット) */}
        <div
          className={cn(
            'relative min-h-[220px] flex-1 p-3 transition-colors',
            dropEnabled && isDragOver ? 'bg-[#FFF1E0]' : 'bg-white'
          )}
          onDragOver={(event) => {
            event.preventDefault();
            if (dropEnabled) setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {uploads.map((upload, index) => (
              <button
                key={upload.key}
                type="button"
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-xl border border-[#F0DFC8] bg-[#FFFBF5] shadow-sm transition-transform',
                  onTileClick
                    ? 'cursor-pointer hover:-translate-y-0.5 hover:rotate-1 hover:ring-2 hover:ring-[#C7743C]'
                    : 'cursor-default'
                )}
                onClick={() => onTileClick?.(index)}
              >
                <img
                  src={upload.previewUrl}
                  alt={upload.fileName}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}

            {uploading ? (
              <div className="flex aspect-square items-center justify-center rounded-xl border border-[#F0DFC8] bg-[#FFFBF5]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#EAD9C5] border-t-[#C7743C]" />
              </div>
            ) : null}

            {dropEnabled ? (
              <button
                type="button"
                className={cn(
                  'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-all',
                  isDragOver
                    ? 'scale-105 border-[#C7743C] bg-[#FFF1E0] text-[#C7743C]'
                    : 'border-[#E2C4A2] text-[#C08A5C] hover:border-[#C7743C] hover:text-[#C7743C]'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploads.length === 0 ? (
                  <Upload className="h-6 w-6" />
                ) : (
                  <Plus className="h-6 w-6" />
                )}
                <span className="px-1 text-[10px] leading-tight">
                  {uploads.length === 0 ? 'ここにドロップ' : 'もう一枚'}
                </span>
              </button>
            ) : null}
          </div>

          {dropEnabled ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []).filter((file) =>
                  file.type.startsWith('image/')
                );
                if (files.length > 0) onFiles?.(files.slice(0, MAX_FILES_PER_DROP));
                event.currentTarget.value = '';
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
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
  const [createdDatasetId, setCreatedDatasetId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<TutorialUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ビューワーチュートリアルの進捗
  const [viewerStackId, setViewerStackId] = useState<string | null>(null);
  const [viewerListToken, setViewerListToken] = useState<string | undefined>(undefined);
  const [viewerOpened, setViewerOpened] = useState(false);
  const [addPageDone, setAddPageDone] = useState(false);
  const [zoomDone, setZoomDone] = useState(false);
  const [swipeDone, setSwipeDone] = useState(false);
  const [infoDone, setInfoDone] = useState(false);
  const [closeDone, setCloseDone] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const isInfoSidebarOpen = useAtomValue(infoSidebarOpenAtom);
  const setInfoSidebarOpen = useSetAtom(infoSidebarOpenAtom);

  const isFirstLibrary = (datasets?.length ?? 0) === 0;
  const isSubmitting = createDataset.isPending;

  // ステップ構成: welcome(0) → create(1) → first-stack(2) → viewer(3) → done(4)
  const CREATE_INDEX = 1;
  const DONE_INDEX = 4;

  // 作成 API の完了〜state 反映の間に datasets が再取得されてもリダイレクトされないようにする
  const tutorialStartedRef = useRef(false);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('ライブラリ名を入力してください');
      return;
    }

    tutorialStartedRef.current = true;
    try {
      setError(null);
      const created = await createDataset.mutateAsync({
        name: trimmed,
        icon,
        themeColor: color,
      });

      // bootstrapNavigationPins を待つ前に確定させ、リダイレクトガードのレースを防ぐ
      setCreatedDatasetId(String(created.id));

      if (!preview) {
        await bootstrapNavigationPins(created.id, { setAsDefault: isFirstLibrary });
      }

      setActiveIndex(CREATE_INDEX + 1);
    } catch (err) {
      tutorialStartedRef.current = false;
      console.error('Failed to create the first library', err);
      setError('ライブラリの作成に失敗しました。時間をおいて再試行してください。');
    }
  }, [name, icon, color, createDataset, isFirstLibrary, bootstrapNavigationPins, preview]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!createdDatasetId || uploading) return;
      setUploading(true);
      setUploadError(null);
      try {
        // 本物のグリッドと同じく、ドロップした画像は1枚ずつ別のスタックになる
        for (const file of files) {
          const stack = await apiClient.createStackWithFile(file, {
            datasetId: createdDatasetId,
          });
          const previewUrl = URL.createObjectURL(file);
          setUploads((prev) => [
            ...prev,
            {
              key: `${file.name}-${prev.length}`,
              previewUrl,
              fileName: file.name,
              stackId: stack.id,
            },
          ]);
        }
      } catch (err) {
        console.error('Tutorial upload failed', err);
        setUploadError('アップロードに失敗しました。もう一度試してみてください。');
      } finally {
        setUploading(false);
      }
    },
    [createdDatasetId, uploading]
  );

  const handleOpenViewer = useCallback(
    (index: number) => {
      const target = uploads[index];
      if (!target || !createdDatasetId) return;
      // 隣接スタックへスワイプ移動できるよう、全スタックの並び(ViewContext)を用意する。
      // グリッドは新しい順に並ぶため、ids も uploads を逆順にして揃える
      const ids = [...uploads].reverse().map((u) => Number(u.stackId));
      const currentIndex = ids.indexOf(Number(target.stackId));
      const token = genListToken({ datasetId: createdDatasetId, mediaType: 'image' });
      saveViewContext({
        token,
        datasetId: createdDatasetId,
        mediaType: 'image' as MediaType,
        ids,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        createdAt: 0,
      });
      setViewerListToken(token);
      setViewerStackId(String(target.stackId));
      setViewerOpened(true);
    },
    [uploads, createdDatasetId]
  );

  const handleCloseViewer = useCallback(() => {
    setViewerStackId(null);
    setCloseDone(true);
    setShowSwipeHint(false);
    setInfoSidebarOpen(false);
  }, [setInfoSidebarOpen]);

  const handleNavigateStack = useCallback((nextStackId: string) => {
    setViewerStackId(nextStackId);
    setSwipeDone(true);
    setShowSwipeHint(false);
  }, []);

  // 埋め込みビューワーで情報パネルが開いたらチェック
  useEffect(() => {
    if (viewerStackId && isInfoSidebarOpen) {
      setInfoDone(true);
    }
  }, [viewerStackId, isInfoSidebarOpen]);

  // 開いているスタックのアセット数をポーリングし、ページが増えたら「追加」を達成扱いにする
  const { data: openStack } = useQuery({
    queryKey: ['stack', createdDatasetId, viewerStackId],
    queryFn: () => apiClient.getStack(String(viewerStackId), String(createdDatasetId)),
    enabled: Boolean(viewerStackId && createdDatasetId && !addPageDone),
    refetchInterval: addPageDone ? false : 1200,
  });

  useEffect(() => {
    if (!openStack) return;
    const count = openStack.assets?.length ?? 0;
    if (count >= 2) {
      setAddPageDone(true);
      // ドロップ成功直後にスワイプを促す矢印を出す
      if (!swipeDone) setShowSwipeHint(true);
    }
  }, [openStack, swipeDone]);

  // ← → キーでのページ送りもスワイプ達成として扱う
  useEffect(() => {
    if (!viewerStackId) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        setSwipeDone(true);
        setShowSwipeHint(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [viewerStackId]);

  const handleOpenLibrary = useCallback(() => {
    if (createdDatasetId) {
      void navigate({ to: '/library/$datasetId', params: { datasetId: createdDatasetId } });
    } else {
      void navigate({ to: '/' });
    }
  }, [createdDatasetId, navigate]);

  const skipToDone = useCallback(() => {
    setActiveIndex(DONE_INDEX);
  }, []);

  // 既にライブラリがある状態で /setup に来たらトップへ(チュートリアル進行中は除く)
  useEffect(() => {
    if (
      !preview &&
      !isLoading &&
      !isFirstLibrary &&
      !createdDatasetId &&
      !tutorialStartedRef.current
    ) {
      void navigate({ to: '/' });
    }
  }, [preview, isLoading, isFirstLibrary, createdDatasetId, navigate]);

  // プレビューURLの後始末(アンマウント時のみ)
  const uploadsRef = useRef<TutorialUpload[]>([]);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);
  useEffect(() => {
    return () => {
      for (const upload of uploadsRef.current) {
        URL.revokeObjectURL(upload.previewUrl);
      }
    };
  }, []);

  const firstStackChecklist = useMemo<ChecklistItem[]>(
    () => [
      {
        id: 'drop-first',
        label: '画像をドロップして最初のスタックを作る',
        done: uploads.length >= 1,
      },
      {
        id: 'drop-second',
        label: 'もう一枚ドロップしてみる',
        done: uploads.length >= 2,
      },
    ],
    [uploads.length]
  );
  const firstStackComplete = firstStackChecklist.every((item) => item.done);

  const viewerChecklist = useMemo<ChecklistItem[]>(
    () => [
      { id: 'open', label: 'サムネイルをクリックしてビューワーを開く', done: viewerOpened },
      {
        id: 'add-page',
        label: 'ビューワーに画像をドロップしてスタックに追加',
        done: addPageDone,
      },
      { id: 'swipe', label: '左右にスワイプ(または ← →)でページを送る', done: swipeDone },
      { id: 'zoom', label: 'スクロール(ピンチ)で拡大してみる', done: zoomDone },
      { id: 'info', label: '右上の i ボタンで情報パネルを開く', done: infoDone },
      { id: 'close', label: '下にドラッグ(または Esc)で閉じる', done: closeDone },
    ],
    [viewerOpened, addPageDone, zoomDone, swipeDone, infoDone, closeDone]
  );
  const viewerComplete = viewerChecklist.every((item) => item.done);

  const firstStackDescription =
    uploads.length === 0
      ? 'ここへお手持ちの画像をドロップしてみよう(あとで消せます)'
      : uploads.length === 1
        ? 'OK、これで画像が登録されたよ。じゃあもう一枚登録してみよう'
        : 'OK、登録した画像はこうやってどんどん並んでいくよ';

  const steps = useMemo(() => {
    return [
      {
        id: 'welcome',
        title: 'ようこそ！',
        description:
          'CaramelBoard は、あなたのコレクションを快適に整理・閲覧するためのアプリです。',
        content: (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="group rounded-2xl border border-[#F3E3CF] bg-white p-5 shadow-[0_10px_30px_-14px_rgba(199,116,60,0.3)] transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_16px_40px_-14px_rgba(199,116,60,0.45)] sm:-rotate-1">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md">
                <HardDrive className="h-5 w-5" />
              </div>
              <h4 className="mb-1 font-bold text-[#46301D]">ローカル完結</h4>
              <p className="text-sm leading-relaxed text-[#8A6A4F]">
                データはすべてこのコンピュータの中に。同じネットワークなら iPad や iPhone
                からも見られます。
              </p>
            </div>
            <div className="group rounded-2xl border border-[#F3E3CF] bg-white p-5 shadow-[0_10px_30px_-14px_rgba(199,116,60,0.3)] transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_16px_40px_-14px_rgba(199,116,60,0.45)] sm:rotate-1">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-md">
                <Upload className="h-5 w-5" />
              </div>
              <h4 className="mb-1 font-bold text-[#46301D]">ドロップで簡単追加</h4>
              <p className="text-sm leading-relaxed text-[#8A6A4F]">
                大量の画像・漫画・動画もまとめてドラッグ&ドロップ。すばやく整理。
              </p>
            </div>
            <div className="group rounded-2xl border border-[#F3E3CF] bg-white p-5 shadow-[0_10px_30px_-14px_rgba(199,116,60,0.3)] transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_16px_40px_-14px_rgba(199,116,60,0.45)] sm:rotate-1">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 text-white shadow-md">
                <Maximize2 className="h-5 w-5" />
              </div>
              <h4 className="mb-1 font-bold text-[#46301D]">使いやすいビューワー</h4>
              <p className="text-sm leading-relaxed text-[#8A6A4F]">
                拡大・スワイプ・連続閲覧がなめらか。こだわりの操作感。
              </p>
            </div>
            <div className="group rounded-2xl border border-[#F3E3CF] bg-white p-5 shadow-[0_10px_30px_-14px_rgba(199,116,60,0.3)] transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_16px_40px_-14px_rgba(199,116,60,0.45)] sm:-rotate-1">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-md">
                <FolderHeart className="h-5 w-5" />
              </div>
              <h4 className="mb-1 font-bold text-[#46301D]">お気に入り・Like・コレクション</h4>
              <p className="text-sm leading-relaxed text-[#8A6A4F]">
                ワンクリックで自分だけのリストを管理。
              </p>
            </div>
            <div className="group rounded-2xl border border-[#F3E3CF] bg-white p-5 shadow-[0_10px_30px_-14px_rgba(199,116,60,0.3)] transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_16px_40px_-14px_rgba(199,116,60,0.45)] sm:col-span-2 sm:-rotate-[0.5deg]">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
                <Tags className="h-5 w-5" />
              </div>
              <h4 className="mb-1 font-bold text-[#46301D]">タグ・作者・自動タグ・色味検索</h4>
              <p className="text-sm leading-relaxed text-[#8A6A4F]">
                タグ付けや作者設定、AI による自動タグ、色味からの検索で、見たい一枚がすぐ見つかる。
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'create',
        title: 'ライブラリを設定',
        description:
          'ライブラリは「イラスト資料」「写真」「漫画」など、用途別にいくつでも作れるよ。まずは最初の1つを作ろう。名前やアイコンは後から変更できます。',
        hideNext: !createdDatasetId,
        content: createdDatasetId ? (
          <div className="text-center">
            <p className="text-sm text-[#6B4E33]">
              ライブラリ「{icon} {name}」を作成済みです。「次へ」で続けましょう。
            </p>
          </div>
        ) : (
          <LibrarySetupForm
            name={name}
            icon={icon}
            color={color}
            description="最初のライブラリには、お気に入り・画像・コミック・動画のピンが自動で追加されます。"
            onNameChange={setName}
            onIconChange={setIcon}
            onColorChange={setColor}
            onSubmit={() => {
              void handleCreate();
            }}
            submitting={isSubmitting}
            disabled={isSubmitting}
            error={error ?? undefined}
          />
        ),
      },
      {
        id: 'first-stack',
        title: '最初のスタックを作ろう',
        description: firstStackDescription,
        hideNext: !firstStackComplete,
        skipLabel: 'チュートリアルをスキップ',
        onSkip: skipToDone,
        content: (
          <div className="space-y-4">
            <MiniLibrary
              libraryName={name}
              libraryIcon={icon}
              uploads={uploads}
              uploading={uploading}
              dropEnabled
              onFiles={(files) => {
                void handleFiles(files);
              }}
            />
            <TutorialChecklist items={firstStackChecklist} />
            {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}
            <p className="text-xs text-[#A78B70]">
              ここで登録した画像は、あとからリストで選択して削除できます。
            </p>
          </div>
        ),
      },
      {
        id: 'viewer',
        title: 'ビューワーを覗いてみよう',
        description:
          'サムネイルをクリックすると本物のビューワーが開くよ。開いたまま画像をドロップすると、同じスタックにページとして重なるんだ',
        hideNext: !viewerComplete,
        skipLabel: 'チュートリアルをスキップ',
        onSkip: skipToDone,
        content: (
          <div className="space-y-4">
            <MiniLibrary
              libraryName={name}
              libraryIcon={icon}
              uploads={uploads}
              uploading={false}
              dropEnabled={false}
              onTileClick={handleOpenViewer}
            />
            <TutorialChecklist items={viewerChecklist} />
          </div>
        ),
      },
      {
        id: 'done',
        title: '準備OK！',
        description: 'これで準備は完了です。それでは楽しんで！',
        hideNext: true,
        content: (
          <div className="space-y-6 text-center">
            <div className="setup-bob mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E8956B] to-[#C7743C] text-4xl shadow-[0_16px_36px_-12px_rgba(199,116,60,0.6)]">
              🍬
            </div>
            <p className="text-sm text-[#8A6A4F]">
              迷ったときは
              <a
                href={HELP_URL}
                target="_blank"
                rel="noreferrer"
                className="mx-1 inline-flex items-center gap-1 font-semibold text-[#B36430] underline underline-offset-4 hover:text-[#C7743C]"
              >
                ヘルプページ
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              も参考にしてね。
            </p>
            <Button
              size="lg"
              className="rounded-lg bg-[#C7743C] px-8 text-white shadow-[0_14px_32px_-10px_rgba(199,116,60,0.7)] transition-all hover:-translate-y-0.5 hover:bg-[#B36430] hover:shadow-xl active:translate-y-0 active:scale-95"
              onClick={handleOpenLibrary}
            >
              ライブラリを開く
            </Button>
          </div>
        ),
      },
    ];
  }, [
    name,
    icon,
    color,
    isSubmitting,
    error,
    createdDatasetId,
    uploads,
    uploading,
    uploadError,
    firstStackChecklist,
    firstStackComplete,
    viewerChecklist,
    viewerComplete,
    firstStackDescription,
    handleCreate,
    handleFiles,
    handleOpenViewer,
    handleOpenLibrary,
    skipToDone,
  ]);

  const maxSelectableIndex = createdDatasetId ? steps.length - 1 : CREATE_INDEX;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF8F0]">
      {/* ふわふわ漂うキャラメルブロブ */}
      <div className="pointer-events-none fixed inset-0">
        <div className="setup-blob absolute -left-24 top-[-8%] h-96 w-96 rounded-full bg-[#F6C290]/40 blur-3xl" />
        <div
          className="setup-blob absolute right-[-12%] top-1/4 h-[28rem] w-[28rem] rounded-full bg-[#E8956B]/25 blur-3xl"
          style={{ animationDelay: '-3s' }}
        />
        <div
          className="setup-blob absolute bottom-[-14%] left-1/3 h-80 w-80 rounded-full bg-[#F3D9C0]/50 blur-3xl"
          style={{ animationDelay: '-6s' }}
        />
        {/* ドットテクスチャ */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(199,116,60,0.10) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
        {/* 筆記体ロゴ */}
        <div className="flex justify-center">
          <CaramelBoardLogo className="setup-bob h-12 w-auto text-[#C7743C] drop-shadow-[0_6px_16px_rgba(199,116,60,0.3)]" />
        </div>

        <SetupGuide
          steps={steps}
          activeIndex={activeIndex}
          maxSelectableIndex={maxSelectableIndex}
          onRequestPrev={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
          onRequestNext={() => setActiveIndex((prev) => Math.min(prev + 1, steps.length - 1))}
          onStepSelect={(index) => setActiveIndex(index)}
        />
      </div>

      {/* 本物のビューワーを埋め込みで起動(機能制限モード) */}
      {viewerStackId && createdDatasetId ? (
        <div
          onWheelCapture={() => setZoomDone(true)}
          onTouchMoveCapture={(event) => {
            if (event.touches.length >= 2) setZoomDone(true);
          }}
          onPointerDownCapture={(event) => {
            swipeStartRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMoveCapture={(event) => {
            const start = swipeStartRef.current;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
              setSwipeDone(true);
              setShowSwipeHint(false);
            }
          }}
          onPointerUpCapture={() => {
            swipeStartRef.current = null;
          }}
        >
          <StackViewer
            datasetId={createdDatasetId}
            mediaType="image"
            stackId={viewerStackId}
            listToken={viewerListToken}
            embedded
            embeddedThemeColor={color}
            onRequestClose={handleCloseViewer}
            onNavigateStack={handleNavigateStack}
          />

          {/* ドロップ成功直後のスワイプ誘導(左上から右へ流れる矢印) */}
          {showSwipeHint && !swipeDone ? (
            <div className="pointer-events-none fixed left-6 top-20 z-[75] flex items-center gap-2 setup-pop-in">
              <span className="setup-swipe-arrow flex items-center gap-1 rounded-full bg-white/90 px-3 py-2 text-sm font-bold text-[#C7743C] shadow-lg backdrop-blur">
                <ArrowRight className="h-5 w-5" />
                スワイプでページを送ろう
              </span>
            </div>
          ) : null}

          {/* ビューワー上に現在のチェックリストを重ねて表示 */}
          <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] w-[min(92vw,400px)] -translate-x-1/2">
            <TutorialChecklist items={viewerChecklist} variant="overlay" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SetupPageContainer;
