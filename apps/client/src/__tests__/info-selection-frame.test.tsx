import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoSelectionFrame } from '@/components/ui/InfoSelectionFrame';

describe('InfoSelectionFrame', () => {
  it('keyカラーの枠をレイアウトに影響しない内側レイヤーとして表示する', () => {
    const { container } = render(<InfoSelectionFrame visible />);
    const frame = container.querySelector('[data-info-selection-frame="true"]');

    expect(frame).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-0',
      'box-border',
      'border-[3px]',
      'border-primary'
    );
    expect(frame).toHaveAttribute('aria-hidden', 'true');
  });

  it('非選択時は枠を表示しない', () => {
    const { container } = render(<InfoSelectionFrame visible={false} />);

    expect(container.querySelector('[data-info-selection-frame="true"]')).toBeNull();
  });
});
