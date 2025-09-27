import { SquareStack, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Marker } from '@/components/ui/Marker';
import TimeBadge from '@/components/ui/TimeBadge/TimeBadge';
import { cn } from '@/lib/utils';
import type { VideoMarker } from '@/types';

interface VideoSeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  /** 開始時に呼ばれる（再生を一時停止するために使用） */
  onScrubStart?: () => void;
  /** ドラッグ終了時に呼ばれる（再生状態の復元に使用） */
  onScrubEnd?: () => void;
  className?: string;
  /** 現在のミュート状態（アイコン表示用） */
  muted?: boolean;
  /** ミュート切替（video要素を再生成せずに切替） */
  onToggleMute?: () => void;
  /** 現在の設定FPS表示 */
  fps?: number;
  /** クリックで 24 → 30 → 48 → 60 と切替 */
  onToggleFps?: () => void;
  /** マーカー（シークバー下に表示） */
  markers?: VideoMarker[];
  /** マーカー編集依頼（ダブルクリックで開く） */
  onEditMarkerRequest?: (marker: VideoMarker, index: number) => void;
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
  fps,
  onToggleFps,
  markers = [],
  onEditMarkerRequest,
}: VideoSeekBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const dragTimeRef = useRef(0);
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

  // Handle mouse events
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const time = getSnappedTimeFromClientX(e.clientX, true);
      setDragTime(time);
      dragTimeRef.current = time;
      setIsDragging(true);
      onScrubStart?.();

      // Add global mouse event listeners
      const handleMouseMove = (e: MouseEvent) => {
        const time = getSnappedTimeFromClientX(e.clientX, true);
        setDragTime(time);
        dragTimeRef.current = time;
        onSeek(time); // ドラッグ中も即時反映
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        onSeek(dragTimeRef.current);
        onScrubEnd?.();

        // Remove global listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [getSnappedTimeFromClientX, onSeek, onScrubEnd, onScrubStart]
  );

  // Handle touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const time = getSnappedTimeFromClientX(touch.clientX, true);
      setDragTime(time);
      dragTimeRef.current = time;
      setIsDragging(true);
      onScrubStart?.();

      // Add global touch event listeners
      const handleTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        const time = getSnappedTimeFromClientX(touch.clientX, true);
        setDragTime(time);
        dragTimeRef.current = time;
        onSeek(time); // ドラッグ中も即時反映
      };

      const handleTouchEnd = () => {
        setIsDragging(false);
        onSeek(dragTimeRef.current);
        onScrubEnd?.();

        // Remove global listeners
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };

      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    },
    [getSnappedTimeFromClientX, onSeek, onScrubEnd, onScrubStart]
  );

  return (
    <div className={cn('px-4 py-2', className)}>
      <div className="flex items-center gap-3">
        {/* Mute toggle button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute?.();
          }}
          className={cn(
            'shrink-0 inline-flex items-center justify-center',
            'w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 transition-colors',
            'text-white hover:text-primary'
          )}
          aria-pressed={!!muted}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        {/* Current time */}
        <TimeBadge seconds={isDragging ? dragTime : currentTime} />

        {/* Seek area (判定2倍), 内部に細いトラックを描画 */}
        <div
          ref={seekAreaRef}
          className="group relative flex-1 h-6 cursor-pointer select-none pointer-events-auto"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
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
                const pct = Math.min(Math.max((m.time / duration) * 100, 0), 100);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Idx is acceptable here
                  <div key={idx} className="absolute" style={{ left: `${pct}%` }}>
                    {/* Marker group: make hover affect icon while preserving hit area */}
                    <div
                      className="absolute -translate-x-1/2 group/marker pointer-events-auto"
                      style={{ top: 0, height: `${HIT_HEIGHT_PX}px`, width: '36px' }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onEditMarkerRequest?.(m, idx);
                      }}
                    >
                      {/* Hit area below the bar (wide) */}
                      <button
                        type="button"
                        className="absolute inset-0"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onSeek(m.time);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          onSeek(m.time);
                        }}
                        aria-label={`Jump to ${m.time.toFixed(2)}s`}
                      />
                    </div>
                    {/* Visual icon: slightly below bar; scales on hover of group */}
                    <div
                      className="absolute -translate-x-1/2 pointer-events-none transition-transform duration-200 ease-out group-hover/marker:scale-[1.4] will-change-transform motion-reduce:transition-none"
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
          title="Change step FPS"
        >
          <SquareStack className="w-4 h-4" />
          <span className="tabular-nums">{fps ?? 30}</span>
        </button>
      </div>
    </div>
  );
}
