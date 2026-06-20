import { SquareStack, Volume2, VolumeX } from 'lucide-react';
import type { MouseEvent, PointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const dragTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const markerDragRef = useRef<{ index: number; pointerId: number; time: number } | null>(null);
  const volumeTrackRef = useRef<HTMLDivElement>(null);
  const volumeDragRef = useRef<{
    pointerId: number;
    startY: number;
    startVolume: number;
    moved: boolean;
    source: 'button' | 'track';
  } | null>(null);
  // 見た目は細いバーのまま、判定は2倍の高さに拡張
  const seekAreaRef = useRef<HTMLDivElement>(null);

  const NUDGE_PX = 8; // 近接ナッジのしきい値（px）
  const TRACK_HEIGHT_PX = 4; // h-1 = 0.25rem = 4px（seekトラックの高さ）
  const _ICON_HEIGHT_PX = 12; // MarkerIcon の実表示高さ（height=12）
  const HIT_HEIGHT_PX = 16; // ヒットエリアの高さ（アイコンより少し高め）
  // バー下端(50%+2px)から余白2pxの位置を基準（APEX）として、
  // アイコン/ヒットエリアの「底辺」をそこに揃える。
  // → top座標は APEX - 高さ
  const APEX_CSS = `calc(50% + ${TRACK_HEIGHT_PX / 2}px + 2px)`; // 50% + 2px + 2px = 50% + 4px
  // 仕様:「シークバーの下にマーカーの上端」が来るように、
  // マーカーの top を APEX に合わせる（= 上端がバー直下）。
  const iconTop = `${APEX_CSS}`;
  // ヒットエリアはアイコンの上端に揃えつつ高さぶん上方向へ拡張
  const _hitTop = `calc(${APEX_CSS} - ${HIT_HEIGHT_PX}px)`; // = calc(50% + 4px - 16px)

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

  // Calculate progress percentage
  const progress = duration > 0 ? (isDragging ? dragTime : currentTime) / duration : 0;
  const progressPercent = Math.min(Math.max(progress * 100, 0), 100);

  // Get time from mouse/touch position
  // clientXから時間を算出（必要に応じてマーカーにナッジ）
  const getSnappedTimeFromClientX = useCallback(
    (clientX: number, enableNudge: boolean) => {
      if (!seekAreaRef.current) return 0;
      const rect = seekAreaRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.min(Math.max(x / rect.width, 0), 1);
      let t = percent * duration;
      if (enableNudge && duration > 0 && markers.length > 0) {
        // 近いマーカーがあれば時間に吸着
        let best: { time: number; px: number } | null = null;
        for (const m of markers) {
          const px = Math.abs((m.time / duration) * rect.width - x);
          if (px <= NUDGE_PX && (!best || px < best.px)) best = { time: m.time, px };
        }
        if (best) t = best.time;
      }
      return t;
    },
    [duration, markers]
  );

  const updateDragTime = useCallback(
    (clientX: number, seekImmediately: boolean) => {
      const time = getSnappedTimeFromClientX(clientX, true);
      setDragTime(time);
      dragTimeRef.current = time;
      if (seekImmediately) onSeek(time);
      return time;
    },
    [getSnappedTimeFromClientX, onSeek]
  );

  const finishDragging = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    activePointerIdRef.current = null;
    setIsDragging(false);
    onSeek(dragTimeRef.current);
    onScrubEnd?.(dragTimeRef.current);
  }, [onScrubEnd, onSeek]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      activePointerIdRef.current = e.pointerId;
      isDraggingRef.current = true;
      setIsDragging(true);
      updateDragTime(e.clientX, false);
      onScrubStart?.();

      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [onScrubStart, updateDragTime]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      updateDragTime(e.clientX, true);
    },
    [updateDragTime]
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      finishDragging();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [finishDragging]
  );

  const handleMarkerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, marker: VideoMarker, index: number) => {
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      if (!e.metaKey || !onMoveMarkerRequest) {
        onSeek(marker.time);
        return;
      }

      e.preventDefault();
      const time = getSnappedTimeFromClientX(e.clientX, false);
      markerDragRef.current = { index, pointerId: e.pointerId, time };
      setDraggingMarker({ index, time });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [getSnappedTimeFromClientX, onMoveMarkerRequest, onSeek]
  );

  const handleMarkerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const active = markerDragRef.current;
      if (!active || active.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const time = getSnappedTimeFromClientX(e.clientX, false);
      markerDragRef.current = { ...active, time };
      setDraggingMarker({ index: active.index, time });
    },
    [getSnappedTimeFromClientX]
  );

  const finishMarkerDrag = useCallback(
    (e?: React.PointerEvent<HTMLButtonElement>) => {
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
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const active = markerDragRef.current;
      if (!active || active.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      finishMarkerDrag(e);
    },
    [finishMarkerDrag]
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

        {/* Seek area (判定2倍), 内部に細いトラックを描画 */}
        <div
          ref={seekAreaRef}
          className="group relative flex-1 h-6 cursor-pointer select-none pointer-events-auto"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={finishDragging}
        >
          {/* Visible track (細い) */}
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-primary/80" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* Markers (track centerより少し下) */}
          {duration > 0 && markers.length > 0 && (
            <div className="absolute inset-0 z-10 top-2.5">
              {markers.map((m, idx) => {
                const markerTime = draggingMarker?.index === idx ? draggingMarker.time : m.time;
                const pct = Math.min(Math.max((markerTime / duration) * 100, 0), 100);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Idx is acceptable here
                  <div key={idx} className="absolute" style={{ left: `${pct}%` }}>
                    <ContextMenu
                      onOpenChange={(open) => setContextMenuMarkerIndex(open ? idx : null)}
                    >
                      <ContextMenuTrigger asChild>
                        {/* Marker group: make hover affect icon while preserving hit area */}
                        <div
                          className="absolute -translate-x-1/2 group/marker pointer-events-auto"
                          style={{ top: 0, height: `${HIT_HEIGHT_PX}px`, width: '36px' }}
                          onContextMenu={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onEditMarkerRequest?.(m, idx);
                          }}
                        >
                          {/* Hit area below the bar (wide) */}
                          <button
                            type="button"
                            className={cn(
                              'absolute inset-0',
                              onMoveMarkerRequest &&
                                isMarkerMoveMode &&
                                'cursor-grab active:cursor-grabbing'
                            )}
                            onPointerDown={(e) => handleMarkerPointerDown(e, m, idx)}
                            onPointerMove={handleMarkerPointerMove}
                            onPointerUp={handleMarkerPointerEnd}
                            onPointerCancel={handleMarkerPointerEnd}
                            onLostPointerCapture={() => finishMarkerDrag()}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            aria-label={t.viewerControls.jumpTo(m.time.toFixed(2))}
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
                        <ContextMenuItem onSelect={() => onEditMarkerRequest?.(m, idx)}>
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
                                onSelect={() => onChangeMarkerColorRequest?.(idx, color.key)}
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
                          onSelect={() => onDeleteMarkerRequest?.(idx)}
                        >
                          {t.viewerControls.deleteMarker}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    {/* Visual icon: slightly below bar; scales on hover of group */}
                    <div
                      className={cn(
                        'absolute -translate-x-1/2 pointer-events-none rounded-sm transition-transform duration-200 ease-out group-hover/marker:scale-[1.4] will-change-transform motion-reduce:transition-none',
                        contextMenuMarkerIndex === idx &&
                          'outline outline-2 outline-white outline-offset-2'
                      )}
                      style={{ top: iconTop }}
                    >
                      <Marker color={m.color} size={12} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Handle: 普段非表示、バーhoverでscale-up、さらにhoverで少し拡大 */}
          <div
            className={cn('absolute top-1/2 -translate-y-1/2 -translate-x-1/2')}
            style={{ left: `${progressPercent}%` }}
          >
            <div
              className={cn(
                'w-4 h-4 bg-primary rounded-full', // 判定1.2倍（w-4/h-4）
                'transition-transform duration-150 ease-out',
                isDragging
                  ? 'opacity-100 scale-100' // ドラッグ中は常に表示
                  : 'opacity-0 scale-0 group-hover:opacity-100 group-hover:scale-100', // バーhoverで表示
                'hover:scale-110' // ハンドルhoverでさらに拡大
              )}
            />
          </div>
        </div>

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
