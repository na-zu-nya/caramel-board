import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStackGrid } from '@/hooks/features/useStackGrid';

const resizeObservers: ResizeObserverMock[] = [];

class ResizeObserverMock implements ResizeObserver {
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }
}

afterEach(() => {
  resizeObservers.length = 0;
  vi.unstubAllGlobals();
});

describe('useStackGridのレイアウト監視', () => {
  it('データと読み込み関数の更新ではResizeObserverを再登録しない', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const store = createStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>{children}</Provider>
      </QueryClientProvider>
    );
    const container = document.createElement('div');
    Object.defineProperties(container, {
      clientWidth: { value: 800, configurable: true },
      clientHeight: { value: 600, configurable: true },
    });
    const containerRef = { current: container };
    const firstLoadRange = vi.fn();
    const secondLoadRange = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ items, onLoadRange }) =>
        useStackGrid({
          items,
          total: 100,
          hasMore: true,
          isLoading: false,
          onLoadRange,
          containerRef,
          useWindowScroll: false,
        }),
      {
        wrapper,
        initialProps: {
          items: [undefined],
          onLoadRange: firstLoadRange,
        },
      }
    );

    expect(resizeObservers).toHaveLength(1);

    rerender({ items: [undefined, undefined], onLoadRange: secondLoadRange });

    expect(resizeObservers).toHaveLength(1);
    unmount();
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
  });
});
