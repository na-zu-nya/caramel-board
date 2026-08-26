import { describe, expect, it, vi } from 'vitest';
import { commitShuffleNavigation, shouldReplaceViewerHistory } from '@/lib/viewer-stack-navigation';

describe('viewer stack navigation', () => {
  it('Shuffle はオーバーレイ内の遷移を履歴へ追加する', async () => {
    const onNavigateStack = vi.fn();
    const navigateRoute = vi.fn();

    await commitShuffleNavigation({ stackId: '42', onNavigateStack, navigateRoute });

    expect(onNavigateStack).toHaveBeenCalledWith('42', { history: 'push' });
    expect(navigateRoute).not.toHaveBeenCalled();
    expect(shouldReplaceViewerHistory({ history: 'push' })).toBe(false);
  });

  it('スワイプなど指定のないスタック遷移は現在の履歴を置き換える', () => {
    expect(shouldReplaceViewerHistory()).toBe(true);
    expect(shouldReplaceViewerHistory({ history: 'replace' })).toBe(true);
  });

  it('遷移が確定するまで Shuffle の処理を完了しない', async () => {
    let resolveNavigation: (() => void) | undefined;
    const navigation = new Promise<void>((resolve) => {
      resolveNavigation = resolve;
    });
    const result = commitShuffleNavigation({
      stackId: '42',
      onNavigateStack: () => navigation,
      navigateRoute: vi.fn(),
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveNavigation?.();
    await result;
    expect(settled).toBe(true);
  });
});
