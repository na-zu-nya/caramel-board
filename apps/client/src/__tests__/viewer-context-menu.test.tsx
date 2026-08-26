import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewerContextMenu } from '@/hooks/features/useViewerContextMenu';

function ContextMenuHarness({ enabled }: { enabled: boolean }) {
  const { isOpen, triggerProps } = useViewerContextMenu({ enabled });

  return (
    <div data-testid="target" {...triggerProps}>
      {isOpen ? 'open' : 'closed'}
    </div>
  );
}

describe('useViewerContextMenu', () => {
  it('無効時はブラウザ標準メニューも抑止し、メニューを開かない', () => {
    render(<ContextMenuHarness enabled={false} />);

    const target = screen.getByTestId('target');
    expect(fireEvent.contextMenu(target, { clientX: 40, clientY: 60 })).toBe(false);
    expect(target).toHaveTextContent('closed');
  });

  it('有効時は指定位置でメニューを開く', () => {
    render(<ContextMenuHarness enabled />);

    const target = screen.getByTestId('target');
    fireEvent.contextMenu(target, { clientX: 40, clientY: 60 });
    expect(target).toHaveTextContent('open');
  });
});
