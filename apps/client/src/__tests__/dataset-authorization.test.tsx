import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDatasetAuthorizationSync } from '@/hooks/useDatasetAuthorizationSync';
import { type ApiClientError, apiClient } from '@/lib/api-client';
import {
  getProtectedDatasetId,
  isDatasetAccessGranted,
  notifyDatasetAuthorizationRequired,
  subscribeDatasetAuthorizationRequired,
} from '@/lib/dataset-authorization';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ライブラリ認証状態の同期', () => {
  it('保護されたライブラリの401レスポンスから対象IDを取得する', () => {
    expect(getProtectedDatasetId({ protected: true, datasetId: 2 })).toBe('2');
    expect(getProtectedDatasetId({ protected: false, datasetId: 2 })).toBeNull();
    expect(getProtectedDatasetId({ protected: true })).toBeNull();
  });

  it('認証状態が確定するまでライブラリ内容へのアクセスを許可しない', () => {
    expect(isDatasetAccessGranted(undefined, undefined)).toBe(true);
    expect(isDatasetAccessGranted('2', undefined)).toBe(false);
    expect(isDatasetAccessGranted('2', { isProtected: true, authorized: false })).toBe(false);
    expect(isDatasetAccessGranted('2', { isProtected: true, authorized: true })).toBe(true);
    expect(isDatasetAccessGranted('2', { isProtected: false, authorized: true })).toBe(true);
  });

  it('APIの401を認証要求として通知する', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDatasetAuthorizationRequired(listener);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: 'Protected dataset', protected: true, datasetId: 2 }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        )
    );

    await expect(apiClient.getStacks({ datasetId: 2, limit: 1 })).rejects.toEqual(
      expect.objectContaining<Partial<ApiClientError>>({
        name: 'ApiClientError',
        status: 401,
      })
    );
    expect(listener).toHaveBeenCalledWith('2');
    unsubscribe();
  });

  it('認証要求をQueryClientの保護状態へ反映する', () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useDatasetAuthorizationSync(), { wrapper });

    act(() => notifyDatasetAuthorizationRequired(2));

    expect(queryClient.getQueryData(['dataset-protection', '2'])).toEqual({
      isProtected: true,
      authorized: false,
    });
    unmount();
  });
});
