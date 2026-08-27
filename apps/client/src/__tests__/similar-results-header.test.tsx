import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimilarResultsHeader } from '@/components/similar/SimilarResultsHeader';

describe('SimilarResultsHeader', () => {
  it('更新ボタンから再取得処理を呼び出す', () => {
    const onRefresh = vi.fn();
    render(
      <SimilarResultsHeader
        label="コレクションに類似: 東北きりたん"
        refreshLabel="リストを更新"
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'リストを更新' }));

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('再取得中は更新ボタンを無効化する', () => {
    render(
      <SimilarResultsHeader
        label="コレクションに類似: 東北きりたん"
        refreshLabel="リストを更新"
        isRefreshing
        onRefresh={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: 'リストを更新' })).toBeDisabled();
  });
});
