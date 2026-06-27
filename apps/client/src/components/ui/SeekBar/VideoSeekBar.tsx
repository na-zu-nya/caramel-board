import { SquareStack, Volume2, VolumeX } from 'lucide-react';
import type { MouseEvent, PointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Marker } from '@/components/ui/Marker';
import TimeBadge from '@/components/ui/TimeBadge/TimeBadge';
import { type Translations, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { VideoMarker } from '@/types';
import SeekTrack, { type SeekTrackMarker, type SeekTrackRenderMarkerParams } from './SeekTrack';

const MARKER_COLOR_OPTIONS = [
  { key: 'white', hex: '#FFFFFF', label: 'White' },
  { key: 'light-gray', hex: '#E5E7EB', label: 'Light Gray' },
  { key: 'bright-red', hex: '#EF4444', label: 'Bright Red' },
  { key: 'bright-orange', hex: '#F97316', label: 'Bright Orange' },
  { key: 'bright-yellow', hex: '#EAB308', label: 'Bright Yellow' },
  { key: 'bright-green', hex: '#22C55E', label: 'Bright Green' },
  { key: 'bright-cyan', hex: '#06B6D4', label: 'Bright Cyan' },
  { key: 'bright-blue', hex: '#3B82F6', label: 'Bright Blue' },
  { key: 'bright-violet', hex: '#8B5CF6', label: 'Bright Violet' },
] as const;

const VOLUME_DRAG_HEIGHT_PX = 96;

type MarkerColorKey = (typeof MARKER_COLOR_OPTIONS)[number]['key'];
type GetSeekValueFromClientX = (clientX: number, enableNudge?: boolean) => number;

const getMarkerColorLabel = (t: Translations, key: MarkerColorKey) => {
  switch (key) {
    case 'white':
      return t.viewerControls.white;
    case 'light-gray':
      return t.viewerControls.lightGray;
    case 'bright-red':
      return t.viewerControls.brightRed;
    case 'bright-orange':
      return t.viewerControls.brightOrange;
    case 'bright-yellow':
      return t.viewerControls.brightYellow;
    case 'bright-green':
      return t.viewerControls.brightGreen;
    case 'bright-cyan':
      return t.viewerControls.brightCyan;
    case 'bright-blue':
      return t.viewerControls.brightBlue;
    case 'bright-violet':
      return t.viewerControls.brightViolet;
  }
};

interface VideoSeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  /** 開始時に呼ばれる（再生を一時停止するために使用） */
  onScrubStart?: () => void;
  /** ドラッグ終了時に呼ばれる（再生状態の復元に使用） */
  onScrubEnd?: (time: number) => void;
  className?: string;
  /** 現在のミュート状態（アイコン表示用） */
  muted?: boolean;
  /** ミュート切替（video要素を再生成せずに切替） */
  onToggleMute?: () => void;
  /** 現在の音量（0-1） */
  volume?: number;
  /** 音量変更（永続化は呼び出し側で行う） */
  onVolumeChange?: (volume: number) => void;
  /** 現在の設定FPS表示 */
  fps?: number;
  /** クリックで 24 → 30 → 48 → 60 と切替 */
  onToggleFps?: () => void;
  /** マーカー（シークバー下に表示） */
  markers?: VideoMarker[];
  /** マーカー編集依頼（ダブルクリックで開く） */
  onEditMarkerRequest?: (marker: VideoMarker, index: number) => void;
  /** Cmd+ドラッグでマーカー位置を変更 */
  onMoveMarkerRequest?: (index: number, time: number) => void;
  /** 右クリックメニューからマーカー削除 */
  onDeleteMarkerRequest?: (index: number) => void;
  /** 右クリックメニューからマーカー色変更 */
  onChangeMarkerColorRequest?: (index: number, color: string) => void;
}

export default function VideoSeekBar({
  currentTime,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
  className,
  muted,
  onToggleMute,
  volume = 1,
  onVolumeChange,
  fps,
  onToggleFps,
  markers = [],
  onEditMarkerRequest,
  onMoveMarkerRequest,
  onDeleteMarkerRequest,
  onChangeMarkerColorRequest,
}: VideoSeekBarProps) {
  const t = useT();
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [draggingMarker, setDraggingMarker] = useState<{ index: number; time: number } | null>(
    null
  );
  const [isMarkerMoveMode, setIsMarkerMoveMode] = useState(false);
  const [contextMenuMarkerIndex, setContextMenuMarkerIndex] = useState<number | null>(null);
  const [isVolumeBarOpen, setIsVolumeBarOpen] = useState(false);
  const [isVolumeHover, setIsVolumeHover] = useState(false);
  const volumeHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerDragRef = useRef<{
    index: number;
    pointerId: number;
    time: number;
    getValueFromClientX: GetSeekValueFromClientX;
  } | null>(null);
  const volumeTrackRef = useRef<HTMLDivElement>(null);
  const volumeDragRef = useRef<{
    pointerId: number;
    startY: number;
    startVolume: number;
    moved: boolean;
    source: 'button' | 'track';
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Meta') setIsMarkerMoveMode(true);
    };
    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Meta') setIsMarkerMoveMode(false);
    };
    const handleBlur = () => setIsMarkerMoveMode(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const seekTrackMarkers = useMemo<Array<SeekTrackMarker<VideoMarker>>>(
    () =>
      markers.map((marker, index) => ({
        key: `${index}:${marker.time}`,
        value: draggingMarker?.index === index ? draggingMarker.time : marker.time,
        data: marker,
      })),
    [draggingMarker, markers]
  );

  const handleSeekTrackScrubStart = useCallback(
    (time: number) => {
      setIsDragging(true);
      setDragTime(time);
      onScrubStart?.();
    },
    [onScrubStart]
  );

  const handleSeekTrackScrubMove = useCallback((time: number) => {
    setDragTime(time);
  }, []);

  const handleSeekTrackScrubEnd = useCallback(
    (time: number) => {
      setDragTime(time);
      setIsDragging(false);
      onScrubEnd?.(time);
    },
    [onScrubEnd]
  );

  const handleMarkerPointerDown = useCallback(
    (
      e: PointerEvent<HTMLButtonElement>,
      marker: VideoMarker,
      index: number,
      getValueFromClientX: GetSeekValueFromClientX
    ) => {
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      if (!e.metaKey || !onMoveMarkerRequest) {
        onSeek(marker.time);
        return;
      }

      e.preventDefault();
      const time = getValueFromClientX(e.clientX, false);
      markerDragRef.current = { index, pointerId: e.pointerId, time, getValueFromClientX };
      setDraggingMarker({ index, time });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [onMoveMarkerRequest, onSeek]
  );

  const handleMarkerPointerMove = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const active = markerDragRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const time = active.getValueFromClientX(e.clientX, false);
    markerDragRef.current = { ...active, time };
    setDraggingMarker({ index: active.index, time });
  }, []);

  const finishMarkerDrag = useCallback(
    (e?: PointerEvent<HTMLButtonElement>) => {
      const active = markerDragRef.current;
      if (!active) return;
      markerDragRef.current = null;
      setDraggingMarker(null);
      onMoveMarkerRequest?.(active.index, active.time);
      if (e?.currentTarget.hasPointerCapture(active.pointerId)) {
        e.currentTarget.releasePointerCapture(active.pointerId);
      }
    },
    [onMoveMarkerRequest]
  );

  const handleMarkerPointerEnd = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const active = markerDragRef.current;
      if (!active || active.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      finishMarkerDrag(e);
    },
    [finishMarkerDrag]
  );

  const renderVideoMarker = useCallback(
    ({
      marker,
      index,
      iconTop,
      hitHeightPx,
      getValueFromClientX,
    }: SeekTrackRenderMarkerParams<VideoMarker>) => (
      <>
        <ContextMenu onOpenChange={(open) => setContextMenuMarkerIndex(open ? index : null)}>
          <ContextMenuTrigger asChild>
            <div
              className="group/marker pointer-events-auto absolute -translate-x-1/2"
              style={{ top: 0, height: `${hitHeightPx}px`, width: '36px' }}
              onContextMenu={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEditMarkerRequest?.(marker, index);
              }}
            >
              <button
                type="button"
                className={cn(
                  'absolute inset-0',
                  onMoveMarkerRequest && isMarkerMoveMode && 'cursor-grab active:cursor-grabbing'
                )}
                onPointerDown={(e) =>
                  handleMarkerPointerDown(e, marker, index, getValueFromClientX)
                }
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={handleMarkerPointerEnd}
                onPointerCancel={handleMarkerPointerEnd}
                onLostPointerCapture={() => finishMarkerDrag()}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                aria-label={t.viewerControls.jumpTo(marker.time.toFixed(2))}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent
            className="w-40"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <ContextMenuItem onSelect={() => onEditMarkerRequest?.(marker, index)}>
              {t.viewerControls.editMarker}
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>{t.viewerControls.color}</ContextMenuSubTrigger>
              <ContextMenuSubContent
                className="w-44"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
              >
                {MARKER_COLOR_OPTIONS.map((color) => (
                  <ContextMenuItem
                    key={color.key}
                    onSelect={() => onChangeMarkerColorRequest?.(index, color.key)}
                  >
                    <span
                      className="mr-2 h-3 w-3 rounded-full border border-gray-300"
                      style={{ backgroundColor: color.hex }}
                    />
                    {getMarkerColorLabel(t, color.key)}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-red-600 focus:text-red-700"
              onSelect={() => onDeleteMarkerRequest?.(index)}
            >
              {t.viewerControls.deleteMarker}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div
          className={cn(
            'pointer-events-none absolute -translate-x-1/2 rounded-sm transition-transform duration-200 ease-out group-hover/marker:scale-[1.4] will-change-transform motion-reduce:transition-none',
            contextMenuMarkerIndex === index && 'outline outline-2 outline-white outline-offset-2'
          )}
          style={{ top: iconTop }}
        >
          <Marker color={marker.color} size={12} />
        </div>
      </>
    ),
    [
      contextMenuMarkerIndex,
      finishMarkerDrag,
      handleMarkerPointerDown,
      handleMarkerPointerEnd,
      handleMarkerPointerMove,
      isMarkerMoveMode,
      onChangeMarkerColorRequest,
      onDeleteMarkerRequest,
      onEditMarkerRequest,
      onMoveMarkerRequest,
      t,
    ]
  );

  const applyVolumeFromTrackY = useCallback(
    (clientY: number) => {
      const rect = volumeTrackRef.current?.getBoundingClientRect();
      if (!rect || rect.height <= 0) return;
      const nextVolume = Math.min(Math.max(1 - (clientY - rect.top) / rect.height, 0), 1);
      onVolumeChange?.(nextVolume);
    },
    [onVolumeChange]
  );

  const handleVolumeButtonPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      volumeDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startVolume: volume,
        moved: false,
        source: 'button',
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [volume]
  );

  const handleVolumeButtonPointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const active = volumeDragRef.current;
      if (!active || active.pointerId !== e.pointerId || active.source !== 'button') return;
      e.preventDefault();
      e.stopPropagation();

      const deltaY = active.startY - e.clientY;
      if (Math.abs(deltaY) < 3 && !active.moved) return;

      active.moved = true;
      setIsVolumeBarOpen(true);
      const nextVolume = Math.min(
        Math.max(active.startVolume + deltaY / VOLUME_DRAG_HEIGHT_PX, 0),
        1
      );
      onVolumeChange?.(nextVolume);
    },
    [onVolumeChange]
  );

  const handleVolumeButtonPointerEnd = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const active = volumeDragRef.current;
      if (!active || active.pointerId !== e.pointerId || active.source !== 'button') return;
      e.preventDefault();
      e.stopPropagation();
      volumeDragRef.current = null;

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      if (!active.moved) {
        onToggleMute?.();
      }
      setIsVolumeBarOpen(false);
    },
    [onToggleMute]
  );

  const handleVolumeButtonPointerCancel = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const active = volumeDragRef.current;
    if (!active || active.pointerId !== e.pointerId || active.source !== 'button') return;
    e.preventDefault();
    e.stopPropagation();
    volumeDragRef.current = null;
    setIsVolumeBarOpen(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleVolumeTrackPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setIsVolumeBarOpen(true);
      volumeDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startVolume: volume,
        moved: true,
        source: 'track',
      };
      applyVolumeFromTrackY(e.clientY);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [applyVolumeFromTrackY, volume]
  );

  const handleVolumeTrackPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const active = volumeDragRef.current;
      if (!active || active.pointerId !== e.pointerId || active.source !== 'track') return;
      e.preventDefault();
      e.stopPropagation();
      applyVolumeFromTrackY(e.clientY);
    },
    [applyVolumeFromTrackY]
  );

  const handleVolumeTrackPointerEnd = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const active = volumeDragRef.current;
    if (!active || active.pointerId !== e.pointerId || active.source !== 'track') return;
    e.preventDefault();
    e.stopPropagation();
    volumeDragRef.current = null;
    setIsVolumeBarOpen(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleVolumeButtonClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const stopVolumePointerPropagation = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const stopVolumeClickPropagation = useCallback((e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const handleVolumeTrackClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleVolumeTrackLostPointerCapture = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const active = volumeDragRef.current;
    if (active?.pointerId === e.pointerId && active.source === 'track') {
      volumeDragRef.current = null;
      setIsVolumeBarOpen(false);
    }
  }, []);

  const handleVolumeButtonLostPointerCapture = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const active = volumeDragRef.current;
    if (active?.pointerId === e.pointerId && active.source === 'button') {
      volumeDragRef.current = null;
      setIsVolumeBarOpen(false);
    }
  }, []);

  const cancelVolumeHoverClose = useCallback(() => {
    if (volumeHoverCloseTimerRef.current) {
      clearTimeout(volumeHoverCloseTimerRef.current);
      volumeHoverCloseTimerRef.current = null;
    }
  }, []);

  const handleVolumeHoverEnter = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse') return;
      cancelVolumeHoverClose();
      setIsVolumeHover(true);
    },
    [cancelVolumeHoverClose]
  );

  const handleVolumeHoverLeave = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse') return;
      cancelVolumeHoverClose();
      volumeHoverCloseTimerRef.current = setTimeout(() => {
        setIsVolumeHover(false);
        volumeHoverCloseTimerRef.current = null;
      }, 150);
    },
    [cancelVolumeHoverClose]
  );

  useEffect(() => {
    return () => {
      cancelVolumeHoverClose();
    };
  }, [cancelVolumeHoverClose]);

  const handleVolumeTrackKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!onVolumeChange) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onVolumeChange(Math.min(volume + 0.05, 1));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onVolumeChange(Math.max(volume - 0.05, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onVolumeChange(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onVolumeChange(1);
      }
    },
    [onVolumeChange, volume]
  );

  const volumePercent = Math.min(Math.max(volume, 0), 1) * 100;

  return (
    <div className={cn('px-4 py-2', className)}>
      <div className="flex items-center gap-3">
        <div
          className="relative shrink-0"
          onPointerDown={stopVolumePointerPropagation}
          onClick={stopVolumeClickPropagation}
          onPointerEnter={handleVolumeHoverEnter}
          onPointerLeave={handleVolumeHoverLeave}
        >
          {/* Mute toggle button */}
          <button
            type="button"
            onClick={handleVolumeButtonClick}
            onPointerDown={handleVolumeButtonPointerDown}
            onPointerMove={handleVolumeButtonPointerMove}
            onPointerUp={handleVolumeButtonPointerEnd}
            onPointerCancel={handleVolumeButtonPointerCancel}
            onLostPointerCapture={handleVolumeButtonLostPointerCapture}
            className={cn(
              'shrink-0 inline-flex items-center justify-center',
              'w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 transition-colors',
              'text-white hover:text-primary'
            )}
            aria-pressed={!!muted}
            title={muted ? t.viewerControls.unmute : t.viewerControls.mute}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <div
            className={cn(
              'absolute left-1/2 top-7 z-20 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out',
              isVolumeBarOpen || isVolumeHover
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-5 opacity-0'
            )}
          >
            <div className="rounded-full bg-black/60 px-1 py-2 shadow-lg shadow-black/30 backdrop-blur-md">
              <div
                ref={volumeTrackRef}
                className="relative h-24 w-5 cursor-ns-resize select-none"
                style={{ touchAction: 'none' }}
                role="slider"
                aria-label={t.viewerControls.volume}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(volumePercent)}
                tabIndex={0}
                onClick={handleVolumeTrackClick}
                onKeyDown={handleVolumeTrackKeyDown}
                onPointerDown={handleVolumeTrackPointerDown}
                onPointerMove={handleVolumeTrackPointerMove}
                onPointerUp={handleVolumeTrackPointerEnd}
                onPointerCancel={handleVolumeTrackPointerEnd}
                onLostPointerCapture={handleVolumeTrackLostPointerCapture}
              >
                <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-white/20" />
                <div
                  className="absolute bottom-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white"
                  style={{ height: `${volumePercent}%` }}
                />
                <div
                  className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.65)]"
                  style={{ bottom: `calc(${volumePercent}% - 0.3125rem)` }}
                />
              </div>
            </div>
          </div>
        </div>
        {/* Current time */}
        <TimeBadge seconds={isDragging ? dragTime : currentTime} />

        <SeekTrack
          value={currentTime}
          max={duration}
          markers={seekTrackMarkers}
          className="flex-1"
          markerLayerClassName="top-2.5"
          onSeek={onSeek}
          onScrubStart={handleSeekTrackScrubStart}
          onScrubMove={handleSeekTrackScrubMove}
          onScrubEnd={handleSeekTrackScrubEnd}
          renderMarker={renderVideoMarker}
        />

        {/* Duration */}
        <TimeBadge seconds={duration} />

        {/* FPS toggle at right end */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFps?.();
          }}
          className={cn(
            'shrink-0 inline-flex items-center gap-1',
            'h-7 rounded-full px-2 bg-black/40 hover:bg-black/60 text-white hover:text-primary text-xs',
            'transition-colors'
          )}
          title={t.viewerControls.changeStepFps}
        >
          <SquareStack className="w-4 h-4" />
          <span className="tabular-nums">{fps ?? 30}</span>
        </button>
      </div>
    </div>
  );
}
