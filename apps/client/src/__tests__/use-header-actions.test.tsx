import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { headerActionsAtom } from '@/stores/ui';

function HeaderActionsOwner({ onShuffle }: { onShuffle: () => void }) {
  useHeaderActions({
    showShuffle: true,
    showFilter: false,
    showSelection: false,
    onShuffle,
  });
  return null;
}

describe('useHeaderActions', () => {
  it('古い所有者のアンマウントで新しいヘッダー操作を消さない', () => {
    const store = createStore();
    const firstShuffle = vi.fn();
    const currentShuffle = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const view = render(
      <>
        <HeaderActionsOwner key="first" onShuffle={firstShuffle} />
        <HeaderActionsOwner key="current" onShuffle={currentShuffle} />
      </>,
      { wrapper }
    );

    expect(store.get(headerActionsAtom).onShuffle).toBe(currentShuffle);

    view.rerender(<HeaderActionsOwner key="current" onShuffle={currentShuffle} />);

    expect(store.get(headerActionsAtom).showShuffle).toBe(true);
    expect(store.get(headerActionsAtom).onShuffle).toBe(currentShuffle);

    view.unmount();

    expect(store.get(headerActionsAtom).showShuffle).toBe(false);
    expect(store.get(headerActionsAtom).onShuffle).toBeNull();
  });
});
