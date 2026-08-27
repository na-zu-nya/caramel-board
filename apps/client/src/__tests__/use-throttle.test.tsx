import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useThrottle } from '@/hooks/utils/useThrottle';

describe('useThrottle', () => {
  it('呼び出し関数が更新されても返す関数の参照を維持し、最新版を呼ぶ', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ callback }: { callback: (value: number) => void }) => useThrottle(callback, 100),
      { initialProps: { callback: first } }
    );
    const throttled = result.current;

    act(() => {
      result.current(1);
    });
    expect(first).toHaveBeenCalledWith(1);

    rerender({ callback: second });
    expect(result.current).toBe(throttled);

    act(() => {
      result.current(2);
      vi.advanceTimersByTime(100);
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(2);
    vi.useRealTimers();
  });
});
