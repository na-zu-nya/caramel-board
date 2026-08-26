import { describe, expect, it } from 'vitest';
import {
  beginPinchGesture,
  includesPinchPointer,
  updatePinchGesture,
} from '@/components/stack-viewer/pinch-gesture';

describe('pinch gesture', () => {
  it('2本目の接触時点を倍率1の基準にする', () => {
    const pointers = new Map([
      [10, { x: 100, y: 200 }],
      [20, { x: 200, y: 200 }],
    ]);

    const pinch = beginPinchGesture(pointers);

    expect(pinch).not.toBeNull();
    expect(pinch?.metrics).toEqual({ distance: 100, centerX: 150, centerY: 200 });
    expect(pinch && updatePinchGesture(pinch.gesture, pointers)?.scaleMultiplier).toBe(1);
  });

  it('同じ2本の指間距離を開始距離に対して1:1で倍率化する', () => {
    const pointers = new Map([
      [10, { x: 100, y: 200 }],
      [20, { x: 200, y: 200 }],
    ]);
    const pinch = beginPinchGesture(pointers);
    expect(pinch).not.toBeNull();
    if (!pinch) return;

    pointers.set(10, { x: 75, y: 200 });
    pointers.set(20, { x: 225, y: 200 });

    expect(updatePinchGesture(pinch.gesture, pointers)).toEqual({
      distance: 150,
      centerX: 150,
      centerY: 200,
      scaleMultiplier: 1.5,
    });
  });

  it('3本目の指が加わっても開始時の2本を追跡し続ける', () => {
    const pointers = new Map([
      [10, { x: 100, y: 200 }],
      [20, { x: 200, y: 200 }],
    ]);
    const pinch = beginPinchGesture(pointers);
    expect(pinch).not.toBeNull();
    if (!pinch) return;

    pointers.set(30, { x: 900, y: 900 });
    pointers.set(20, { x: 250, y: 200 });

    expect(updatePinchGesture(pinch.gesture, pointers)?.scaleMultiplier).toBe(1.5);
    expect(includesPinchPointer(pinch.gesture, 20)).toBe(true);
    expect(includesPinchPointer(pinch.gesture, 30)).toBe(false);
  });

  it('追跡中の指が失われた場合は更新値を返さない', () => {
    const pointers = new Map([
      [10, { x: 100, y: 200 }],
      [20, { x: 200, y: 200 }],
    ]);
    const pinch = beginPinchGesture(pointers);
    expect(pinch).not.toBeNull();
    if (!pinch) return;

    pointers.delete(20);

    expect(updatePinchGesture(pinch.gesture, pointers)).toBeNull();
  });
});
