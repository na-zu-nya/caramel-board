import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ViewerInteractionLockButton from '@/components/stack-viewer/ViewerInteractionLockButton';

describe('ViewerInteractionLockButton', () => {
  it('解除状態からロック操作を通知する', () => {
    const onToggle = vi.fn();
    render(
      <ViewerInteractionLockButton
        locked={false}
        lockLabel="画像操作をロック"
        unlockLabel="画像操作のロックを解除"
        onToggle={onToggle}
      />
    );

    const button = screen.getByRole('button', { name: '画像操作をロック' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('ロック状態を押下可能なトグルとして表現する', () => {
    render(
      <ViewerInteractionLockButton
        locked
        lockLabel="画像操作をロック"
        unlockLabel="画像操作のロックを解除"
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '画像操作のロックを解除' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
