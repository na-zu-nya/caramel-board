import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TapZoneOverlay from '@/components/stack-viewer/TapZoneOverlay';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
}

Object.defineProperty(window, 'PointerEvent', {
  configurable: true,
  value: TestPointerEvent,
});

const renderOverlay = (interactionLocked = false) => {
  const onPinchStart = vi.fn();
  const onPinchZoom = vi.fn();
  const onPinchEnd = vi.fn();
  const onWheelZoom = vi.fn();
  const view = render(
    <TapZoneOverlay
      onLeftTap={vi.fn()}
      onRightTap={vi.fn()}
      onPinchStart={onPinchStart}
      onPinchZoom={onPinchZoom}
      onPinchEnd={onPinchEnd}
      onWheelZoom={onWheelZoom}
      interactionLocked={interactionLocked}
    />
  );
  const interactionLayer = view.container.firstElementChild?.firstElementChild;
  if (!(interactionLayer instanceof HTMLElement)) {
    throw new Error('タッチ操作レイヤーが見つかりません');
  }

  return { interactionLayer, onPinchStart, onPinchZoom, onPinchEnd, onWheelZoom };
};

describe('TapZoneOverlay pinch interaction', () => {
  it('2本目のtouch pointerdownでピンチを開始し、その距離から倍率を算出する', () => {
    const { interactionLayer, onPinchStart, onPinchZoom } = renderOverlay();

    fireEvent.pointerDown(interactionLayer, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerDown(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });

    expect(onPinchStart).toHaveBeenCalledOnce();
    expect(onPinchStart).toHaveBeenCalledWith(150, 200);

    fireEvent.pointerMove(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 250,
      clientY: 200,
    });

    expect(onPinchZoom).toHaveBeenLastCalledWith(175, 200, 1.5);
  });

  it('3本目のタッチでは進行中の2本を入れ替えない', () => {
    const { interactionLayer, onPinchStart, onPinchZoom } = renderOverlay();

    fireEvent.pointerDown(interactionLayer, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerDown(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerDown(interactionLayer, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 900,
      clientY: 900,
    });
    fireEvent.pointerMove(interactionLayer, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 1000,
      clientY: 1000,
    });

    expect(onPinchStart).toHaveBeenCalledOnce();
    expect(onPinchZoom).toHaveBeenLastCalledWith(150, 200, 1);
  });

  it('追跡中の指が離れたらピンチを終了する', () => {
    const { interactionLayer, onPinchEnd } = renderOverlay();

    fireEvent.pointerDown(interactionLayer, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerDown(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });

    expect(onPinchEnd).toHaveBeenCalledOnce();
  });

  it('mouse pointerは2点ピンチへ混在させない', () => {
    const { interactionLayer, onPinchStart } = renderOverlay();

    fireEvent.pointerDown(interactionLayer, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerDown(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });

    expect(onPinchStart).not.toHaveBeenCalled();
  });

  it('ロック中は操作レイヤーを維持したままpointerとwheelを遮断する', () => {
    const { interactionLayer, onPinchStart, onPinchZoom, onWheelZoom } = renderOverlay(true);

    fireEvent.pointerDown(interactionLayer, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerDown(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(interactionLayer, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 250,
      clientY: 200,
    });
    fireEvent.wheel(interactionLayer, { deltaY: -100 });

    expect(onPinchStart).not.toHaveBeenCalled();
    expect(onPinchZoom).not.toHaveBeenCalled();
    expect(onWheelZoom).not.toHaveBeenCalled();
  });
});
