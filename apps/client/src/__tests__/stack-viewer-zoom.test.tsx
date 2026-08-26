import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStackViewerZoom } from '@/hooks/features/useStackViewerZoom';

const createZoomElements = () => {
  const image = document.createElement('img');
  Object.defineProperties(image, {
    naturalWidth: { value: 100 },
    naturalHeight: { value: 100 },
  });

  const surface = document.createElement('div');
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

  return { image, surface };
};

describe('useStackViewerZoom pinch interaction', () => {
  it('最小倍率に達した後も、指を離さず反転して拡大できる', () => {
    const { image, surface } = createZoomElements();
    const { result } = renderHook(() =>
      useStackViewerZoom({
        enabled: true,
        getMediaElement: () => image,
        getSurfaceElement: () => surface,
      })
    );

    act(() => {
      result.current.startPinch(50, 50);
      result.current.updatePinch(50, 50, 0.8);
    });
    expect(result.current.zoomTransform.scale).toBe(1);

    act(() => {
      result.current.updatePinch(50, 50, 1.2);
    });
    expect(result.current.zoomTransform.scale).toBe(1.2);
  });
});
