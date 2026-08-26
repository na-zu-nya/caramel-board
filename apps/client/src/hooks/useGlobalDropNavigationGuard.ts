import { useEffect } from 'react';

/**
 * DropZone の外側にファイル/URL がドロップされた場合の Safari 既定動作を防ぐグローバルガード。
 *
 * Safari (WebKit) はドラッグ中の要素が dragover/drop を preventDefault しないと、
 * ドロップされたテキストが URL として解釈された際に新規タブでナビゲートしてしまう。
 * DropZone 側は対象要素上でのみ preventDefault するため、DropZone の外(余白やヘッダーなど)に
 * ドロップされた場合はこのフォールバックで window レベルに preventDefault する。
 *
 * defaultPrevented を確認してから処理することで、DropZone(stopPropagation 済み)や
 * 他のハンドラ(preventDefault 済み)の挙動には一切干渉しない。
 */
// input / textarea / contenteditable へのテキストドラッグ挿入はブラウザの既定動作で、
// 要素側は preventDefault しないため、ガードの対象から除外する
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') !== null;
};

export function useGlobalDropNavigationGuard() {
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      // 編集可能要素へのテキストドラッグ挿入は既定動作に任せる
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };

    const handleDrop = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      // 編集可能要素へのテキストドラッグ挿入は既定動作に任せる
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);
}
