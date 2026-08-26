export interface PinchPointerPosition {
  x: number;
  y: number;
}

export interface PinchMetrics {
  distance: number;
  centerX: number;
  centerY: number;
}

export interface ActivePinchGesture {
  pointerIds: readonly [number, number];
  startDistance: number;
}

const getMetricsForPointerIds = (
  pointers: ReadonlyMap<number, PinchPointerPosition>,
  pointerIds: ActivePinchGesture['pointerIds']
): PinchMetrics | null => {
  const first = pointers.get(pointerIds[0]);
  const second = pointers.get(pointerIds[1]);
  if (!first || !second) return null;

  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  if (!Number.isFinite(distance) || distance <= 0) return null;

  return {
    distance,
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
  };
};

export const beginPinchGesture = (
  pointers: ReadonlyMap<number, PinchPointerPosition>
): { gesture: ActivePinchGesture; metrics: PinchMetrics } | null => {
  const pointerIds = Array.from(pointers.keys()).slice(0, 2);
  if (pointerIds.length !== 2) return null;

  const pair: ActivePinchGesture['pointerIds'] = [pointerIds[0], pointerIds[1]];
  const metrics = getMetricsForPointerIds(pointers, pair);
  if (!metrics) return null;

  return {
    gesture: {
      pointerIds: pair,
      startDistance: metrics.distance,
    },
    metrics,
  };
};

export const updatePinchGesture = (
  gesture: ActivePinchGesture,
  pointers: ReadonlyMap<number, PinchPointerPosition>
): (PinchMetrics & { scaleMultiplier: number }) | null => {
  const metrics = getMetricsForPointerIds(pointers, gesture.pointerIds);
  if (!metrics) return null;

  return {
    ...metrics,
    scaleMultiplier: metrics.distance / gesture.startDistance,
  };
};

export const includesPinchPointer = (gesture: ActivePinchGesture, pointerId: number) =>
  gesture.pointerIds.includes(pointerId);
