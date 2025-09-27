/**
 * スクロールバー幅を動的に計算して、レイアウトシフトを防ぐためのユーティリティ
 */

let scrollbarWidth: number | null = null;

/**
 * スクロールバーの幅を計算する
 */
export function getScrollbarWidth(): number {
  if (scrollbarWidth !== null) {
    return scrollbarWidth;
  }

  // オーバーレイスクロールバー（macOS等）の検出
  const hasOverlayScrollbars =
    // macOSやiOSの検出
    /Mac|iPad|iPhone/.test(navigator.userAgent) ||
    // CSS supports チェック
    !window.CSS?.supports?.('scrollbar-gutter', 'stable');

  if (hasOverlayScrollbars) {
    scrollbarWidth = 0;
    return scrollbarWidth;
  }

  // 一時的な要素を作成してスクロールバー幅を測定
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll';
  outer.style.msOverflowStyle = 'scrollbar'; // IE対応
  document.body.appendChild(outer);

  const inner = document.createElement('div');
  outer.appendChild(inner);

  scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  document.body.removeChild(outer);

  return scrollbarWidth;
}

/**
 * body要素にスクロールバー幅分の補正を適用
 */
export function applyScrollbarCompensation(): void {
  const width = getScrollbarWidth();
  if (width > 0) {
    document.body.style.paddingRight = `${width}px`;
    document.body.classList.add('list-stable-body');
  } else {
    // オーバーレイスクロールバーの場合はクラスのみ追加
    document.body.classList.add('list-stable-body');
  }
}

/**
 * body要素のスクロールバー補正を削除
 */
export function removeScrollbarCompensation(): void {
  document.body.style.paddingRight = '';
  document.body.classList.remove('list-stable-body');
}

/**
 * 使用例:
 *
 * useEffect(() => {
 *   applyScrollbarCompensation();
 *   return () => {
 *     removeScrollbarCompensation();
 *   };
 * }, []);
 */
