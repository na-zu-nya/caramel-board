import { useEffect, useRef } from 'react';
import {
  DEFAULT_ACCEPT,
  extractFilesFromDataTransfer,
  filterAcceptedFiles,
} from '@/components/ui/DropZone';

/**
 * PC でテキスト入力欄にフォーカスがない状態で画像を Cmd+V ペーストした際に、
 * 現在のページのアップロード処理へファイルを渡すためのグローバルペーストフック。
 *
 * モバイル向けの FloatingUploadAction のペースト欄や、DropZone のドラッグ&ドロップとは独立して動作する。
 *
 * グリッドとビューワオーバーレイが同時にマウントされるケースで二重アップロードが起きないよう、
 * モジュールレベルのレジストリに「マウント順」でエントリを登録し、
 * paste イベント発火時は enabled な登録のうち最後(= 最後にマウントされたもの)だけが処理する。
 */
interface UseGlobalPasteUploadOptions {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  enabled?: boolean;
}

interface ResolvedPasteUploadOptions {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple: boolean;
  enabled: boolean;
}

interface PasteRegistryEntry {
  optionsRef: { current: ResolvedPasteUploadOptions };
}

const registry: PasteRegistryEntry[] = [];
let pasteListenerAttached = false;

// input / textarea / select / contenteditable へのペーストは通常のテキストペーストとして
// ブラウザの既定動作に任せ、グローバルアップロードの対象からは除外する
function isEditableElement(element: Element): boolean {
  if (element.closest('input, textarea, select, [contenteditable]')) return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (target instanceof Element) {
    return isEditableElement(target);
  }

  // target が Element でない場合は activeElement で同様に判定する
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return active instanceof Element ? isEditableElement(active) : false;
}

function hasFileItem(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData?.items) return false;
  return Array.from(clipboardData.items).some((item) => item.kind === 'file');
}

async function resolveAndDispatchFiles(
  clipboardData: DataTransfer,
  entry: PasteRegistryEntry
): Promise<void> {
  const files = await extractFilesFromDataTransfer(clipboardData, () => undefined);
  const { onFiles, accept, multiple } = entry.optionsRef.current;
  const filtered = filterAcceptedFiles(files, accept);
  if (filtered.length === 0) return;

  onFiles(multiple ? filtered : [filtered[0]]);
}

function handleGlobalPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented) return;
  if (isEditingTarget(event.target)) return;

  const clipboardData = event.clipboardData;
  // 同期チェック: clipboardData.items にファイルが含まれない場合は即座に諦める。
  // extractFilesFromDataTransfer は非同期のため、preventDefault の判断はここで
  // 同期的に済ませておく必要がある(非同期完了後の preventDefault は無効なため)
  if (!hasFileItem(clipboardData)) return;

  // enabled な登録のうち最後(= 最後にマウントされたもの)だけが処理する
  let target: PasteRegistryEntry | undefined;
  for (let i = registry.length - 1; i >= 0; i -= 1) {
    if (registry[i].optionsRef.current.enabled) {
      target = registry[i];
      break;
    }
  }
  if (!target) return;

  event.preventDefault();

  void resolveAndDispatchFiles(clipboardData as DataTransfer, target);
}

function attachPasteListenerIfNeeded(): void {
  if (pasteListenerAttached || typeof document === 'undefined') return;
  document.addEventListener('paste', handleGlobalPaste);
  pasteListenerAttached = true;
}

function detachPasteListenerIfNeeded(): void {
  if (!pasteListenerAttached || typeof document === 'undefined') return;
  if (registry.length > 0) return;
  document.removeEventListener('paste', handleGlobalPaste);
  pasteListenerAttached = false;
}

export function useGlobalPasteUpload(options: UseGlobalPasteUploadOptions): void {
  const { onFiles, accept = DEFAULT_ACCEPT, multiple = true, enabled = true } = options;

  // options は ref 経由で最新を参照する。mount 時に1度だけレジストリへ登録し、
  // onFiles などの再生成があっても登録順序(= マウント順)は変えない
  const optionsRef = useRef<ResolvedPasteUploadOptions>({ onFiles, accept, multiple, enabled });
  optionsRef.current = { onFiles, accept, multiple, enabled };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const entry: PasteRegistryEntry = { optionsRef };
    registry.push(entry);
    attachPasteListenerIfNeeded();

    return () => {
      const index = registry.indexOf(entry);
      if (index !== -1) registry.splice(index, 1);
      detachPasteListenerIfNeeded();
    };
  }, []);
}
