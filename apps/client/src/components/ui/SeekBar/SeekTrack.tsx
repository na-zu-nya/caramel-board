import type { Key, PointerEvent, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_NUDGE_PX = 8;
const TRACK_HEIGHT_PX = 4;
const MARKER_HIT_HEIGHT_PX = 16;
const MARKER_ICON_TOP = `calc(50% + ${TRACK_HEIGHT_PX / 2}px + 2px)`;

export interface SeekTrackMarker<TData> {
  key: Key;
  value: number;
  data: TData;
}

export interface SeekTrackRenderMarkerParams<TData> {
  marker: TData;
  index: number;
  value: number;
  percent: number;
  iconTop: string;
  hitHeightPx: number;
  getValueFromClientX: (clientX: number, enableNudge?: boolean) => number;
}

interface SeekTrackProps<TData> {
  value: number;
  max: number;
  markers?: Array<SeekTrackMarker<TData>>;
  className?: string;
  trackClassName?: string;
  rangeClassName?: string;
  handleClassName?: string;
  markerLayerClassName?: string;
  handleVisibility?: 'hover' | 'always';
  rangeOrigin?: 'start' | 'end';
  nudgePx?: number;
  step?: number;
  seekOnPointerDown?: boolean;
  onSeek: (value: number) => void;
  onScrubStart?: (value: number) => void;
  onScrubMove?: (value: number) => void;
  onScrubEnd?: (value: number) => void;
  renderMarker?: (params: SeekTrackRenderMarkerParams<TData>) => ReactNode;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function SeekTrack<TData>({
  value,
  max,
  markers = [],
  className,
  trackClassName,
  rangeClassName,
  handleClassName,
  markerLayerClassName,
  handleVisibility = 'hover',
  rangeOrigin = 'start',
  nudgePx = DEFAULT_NUDGE_PX,
  step,
  seekOnPointerDown = false,
  onSeek,
  onScrubStart,
  onScrubMove,
  onScrubEnd,
  renderMarker,
}: SeekTrackProps<TData>) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const seekAreaRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dragValueRef = useRef(0);
  const normalizedMax = Math.max(0, max);
  const normalizedStep = step !== undefined && Number.isFinite(step) && step > 0 ? step : null;
  const displayValue = isDragging ? dragValue : value;
  const progress = normalizedMax > 0 ? clamp(displayValue / normalizedMax, 0, 1) : 0;
  const progressPercent = progress * 100;

  const getValueFromClientX = useCallback(
    (clientX: number, enableNudge = true) => {
      const rect = seekAreaRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || normalizedMax <= 0) return 0;

      const x = clamp(clientX - rect.left, 0, rect.width);
      let nextValue = (x / rect.width) * normalizedMax;

      if (enableNudge && nudgePx > 0 && markers.length > 0) {
        let closest: { value: number; px: number } | null = null;
        for (const marker of markers) {
          const px = Math.abs((marker.value / normalizedMax) * rect.width - x);
          if (px <= nudgePx && (!closest || px < closest.px)) {
            closest = { value: marker.value, px };
          }
        }
        if (closest) nextValue = closest.value;
      }

      if (nextValue <= 0) {
        nextValue = 0;
      } else if (nextValue >= normalizedMax) {
        nextValue = normalizedMax;
      } else if (normalizedStep !== null) {
        nextValue = Math.round(nextValue / normalizedStep) * normalizedStep;
      }

      return clamp(nextValue, 0, normalizedMax);
    },
    [markers, normalizedMax, normalizedStep, nudgePx]
  );

  const updateDragValue = useCallback(
    (clientX: number, seekImmediately: boolean) => {
      const nextValue = getValueFromClientX(clientX, true);
      setDragValue(nextValue);
      dragValueRef.current = nextValue;
      onScrubMove?.(nextValue);
      if (seekImmediately) onSeek(nextValue);
      return nextValue;
    },
    [getValueFromClientX, onScrubMove, onSeek]
  );

  const finishDragging = useCallback(() => {
    if (activePointerIdRef.current === null) return;
    activePointerIdRef.current = null;
    setIsDragging(false);
    onSeek(dragValueRef.current);
    onScrubEnd?.(dragValueRef.current);
  }, [onScrubEnd, onSeek]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      activePointerIdRef.current = event.pointerId;
      setIsDragging(true);
      const nextValue = updateDragValue(event.clientX, seekOnPointerDown);
      onScrubStart?.(nextValue);

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [onScrubStart, seekOnPointerDown, updateDragValue]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      updateDragValue(event.clientX, true);
    },
    [updateDragValue]
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      finishDragging();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [finishDragging]
  );

  const rangeStyle =
    rangeOrigin === 'end'
      ? { right: 0, width: `${100 - progressPercent}%` }
      : { left: 0, width: `${progressPercent}%` };

  return (
    <div
      ref={seekAreaRef}
      className={cn('group relative h-6 cursor-pointer select-none pointer-events-auto', className)}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={finishDragging}
    >
      <div className="absolute inset-0 flex items-center">
        <div
          className={cn(
            'relative h-1 w-full overflow-hidden rounded-full bg-black/40',
            trackClassName
          )}
        >
          <div
            className={cn('absolute top-0 h-full bg-primary/80', rangeClassName)}
            style={rangeStyle}
          />
        </div>
      </div>

      {normalizedMax > 0 && markers.length > 0 && renderMarker && (
        <div className={cn('absolute inset-0 z-10', markerLayerClassName)}>
          {markers.map((marker, index) => {
            const markerProgress = clamp(marker.value / normalizedMax, 0, 1);
            const markerPercent = markerProgress * 100;
            return (
              <div key={marker.key} className="absolute" style={{ left: `${markerPercent}%` }}>
                {renderMarker({
                  marker: marker.data,
                  index,
                  value: marker.value,
                  percent: markerPercent,
                  iconTop: MARKER_ICON_TOP,
                  hitHeightPx: MARKER_HIT_HEIGHT_PX,
                  getValueFromClientX,
                })}
              </div>
            );
          })}
        </div>
      )}

      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${progressPercent}%` }}
      >
        <div
          className={cn(
            'h-4 w-4 rounded-full bg-primary transition-transform duration-150 ease-out',
            handleVisibility === 'always'
              ? 'opacity-100 scale-100'
              : isDragging
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-0 group-hover:opacity-100 group-hover:scale-100',
            'hover:scale-110',
            handleClassName
          )}
        />
      </div>
    </div>
  );
}
