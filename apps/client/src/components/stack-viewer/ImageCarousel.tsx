import type { CSSProperties } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import VideoSeekBar from '@/components/ui/SeekBar/VideoSeekBar';
import { VideoTransportControls } from '@/components/ui/VideoTransportControls';
import { useVideoPausedSeekFrameFlush } from '@/hooks/features/useVideoPausedSeekFrameFlush';
import { isVideoAsset } from '@/lib/media';
import { cn } from '@/lib/utils';
import {
  cycleViewerFps,
  getViewerFps,
  getViewerMuted,
  getViewerVolume,
  setViewerMuted,
  setViewerVolume,
} from '@/lib/viewerSettings';
import type { Asset, VideoMarker } from '@/types';

interface ImageCarouselProps {
  currentAsset?: Asset;
  nextAsset?: Asset;
  prevAsset?: Asset;
  /** マーカーのオーバーライド（指定時はcurrentAsset.metaではなくこちらを使用） */
  markers?: VideoMarker[];
  gestureTransform?: {
    translateX: number;
    translateY: number;
    scale: number;
    opacity: number;
  };
  onImageClick?: (relativeX: number, relativeY?: number) => void;
  className?: string;
  translateX?: number;
  /** Cmd押下中など、画像のネイティブドラッグを許可する */
  nativeDragEnabled?: boolean;
  zoomTransform?: {
    scale: number;
    translateX: number;
    translateY: number;
  };
  /** シークバーの固定表示位置（オーバーレイより上に出すため） */
  uiInsets?: { top: number; left: number; right: number };
  /** マーカー編集リクエスト（SeekBar のダブルクリックから） */
  onEditMarkerRequest?: (marker: VideoMarker, index: number) => void;
  /** マーカー位置変更リクエスト */
  onMoveMarkerRequest?: (index: number, time: number) => void;
  /** マーカー削除リクエスト */
  onDeleteMarkerRequest?: (index: number) => void;
  /** マーカー色変更リクエスト */
  onChangeMarkerColorRequest?: (index: number, color: string) => void;
}

export interface ImageCarouselRef {
  updateTranslateX: (value: number) => void;
  updateVerticalTransform: (
    translateY: number,
    scale: number,
    opacity: number,
    backgroundProgress?: number
  ) => void;
  getViewportWidth: () => number;
  /** 現在表示中の画像要素（画像時のみ）。動画の場合は null */
  getCurrentImageElement: () => HTMLImageElement | null;
  /** 現在表示中のズーム対象メディア要素 */
  getCurrentZoomMediaElement: () => HTMLImageElement | HTMLVideoElement | null;
  /** 現在表示中の画像のズーム対象面（画像時のみ）。動画の場合は null */
  getCurrentImageSurfaceElement: () => HTMLDivElement | null;
  /** 現在のアセットが動画なら true */
  isCurrentVideo: () => boolean;
  /** 現在の動画の再生/停止をトグル（動画以外は無視） */
  toggleVideo: () => void;
  /** 現在の動画を一時停止 */
  pauseVideo: () => void;
  /** 現在の動画を再生 */
  playVideo: () => void;
  /** 秒数で相対シーク。preservePlaying=true の時は元の再生状態を維持 */
  seekBySeconds: (delta: number, preservePlaying?: boolean) => void;
  /** 指定時刻にシーク。preservePlaying=true の時は元の再生状態を維持 */
  seekTo: (time: number, preservePlaying?: boolean) => void;
  /** フレーム単位の前後移動（概算: 1/30s）。操作後は一時停止 */
  stepFrame: (n: number) => void;
  /** 先頭/末尾へ移動。preservePlaying=true で再生状態維持 */
  seekToStart: (preservePlaying?: boolean) => void;
  seekToEnd: (preservePlaying?: boolean) => void;
  /** 現在の動画の再生位置（秒） */
  getCurrentTime: () => number;
  /** 現在の動画が再生中かどうか */
  getIsPlaying: () => boolean;
  /** 現在の動画フレームをPNGとして保存 */
  downloadCurrentVideoFrame: () => Promise<boolean>;
  requestRestorePlayback: (payload?: { time: number; wasPlaying: boolean }) => void;
}

interface VideoState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
  volume: number;
}

type DragImageStyle = CSSProperties & {
  WebkitUserDrag?: 'none' | 'auto' | 'element';
};

const stripUrlParams = (src: string): string => {
  const q = src.indexOf('?');
  const h = src.indexOf('#');
  const cuts = [q, h].filter((idx) => idx >= 0);
  if (cuts.length === 0) return src;
  return src.slice(0, Math.min(...cuts));
};

const getAssetFilenameBase = (asset?: Asset | null) => {
  const source = asset?.originalName || asset?.file || asset?.url || 'video-frame';
  const clean = stripUrlParams(source);
  const filename = clean.split(/[\\/]/).pop() || 'video-frame';
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/[^\w.-]+/g, '_') || 'video-frame';
};

const getFrameFilename = (asset: Asset | undefined, time: number) => {
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
  const timeLabel = seconds.toFixed(3).replace('.', '_');
  return `${getAssetFilenameBase(asset)}-frame-${timeLabel}s.png`;
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

const VIDEO_SHUTTLE_RATE = 1.5;

const getFiniteVideoDuration = (video: HTMLVideoElement, fallback: number) =>
  Number.isFinite(video.duration) ? video.duration : fallback;

const getFiniteVideoCurrentTime = (video: HTMLVideoElement, fallback: number) =>
  Number.isFinite(video.currentTime) ? video.currentTime : fallback;

const clampVideoTime = (time: number, duration: number) =>
  Math.min(Math.max(Number.isFinite(time) ? time : 0, 0), Math.max(0, duration || 0));

const ImageCarousel = forwardRef<ImageCarouselRef, ImageCarouselProps>(
  (
    {
      currentAsset,
      nextAsset,
      prevAsset,
      markers,
      gestureTransform = { translateX: 0, translateY: 0, scale: 1, opacity: 1 },
      onImageClick,
      className,
      translateX = 0,
      nativeDragEnabled = false,
      zoomTransform = { scale: 1, translateX: 0, translateY: 0 },
      uiInsets,
      onEditMarkerRequest,
      onMoveMarkerRequest,
      onDeleteMarkerRequest,
      onChangeMarkerColorRequest,
    },
    ref
  ) => {
    const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
    const [videoState, setVideoState] = useState<VideoState>({
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      muted: getViewerMuted(),
      volume: getViewerVolume(),
    });
    const [fps, setFps] = useState<number>(getViewerFps());
    const [isTransportHovered, setIsTransportHovered] = useState(false);
    const [_isScrubbing, setIsScrubbing] = useState(false);
    const wasPlayingBeforeScrubRef = useRef<boolean>(false);
    const isScrubbingRef = useRef(false);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const resumeAfterSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shuttleAnimationFrameRef = useRef<number | null>(null);
    const shuttleLastTimestampRef = useRef<number | null>(null);
    const shuttleRestoreMutedRef = useRef<boolean | null>(null);
    const frameStepTargetTimeRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const backgroundRef = containerRef; // Use container as background ref
    const currentAssetRef = useRef<HTMLDivElement>(null);
    const currentImageSurfaceRef = useRef<HTMLDivElement | null>(null);
    const nextAssetRef = useRef<HTMLDivElement>(null);
    const prevAssetRef = useRef<HTMLDivElement>(null);
    const currentVideoRef = useRef<HTMLVideoElement | null>(null);
    const currentVideoHostRef = useRef<HTMLDivElement | null>(null);
    const ownedVideoRef = useRef<HTMLVideoElement | null>(null);
    const currentVideoSrcRef = useRef<string | null>(null);
    const autoplayVideoKeyRef = useRef<string | null>(null);
    const lastPlaybackRef = useRef<{ time: number; wasPlaying: boolean }>({
      time: 0,
      wasPlaying: false,
    });
    const pendingRestoreRef = useRef<{ time: number; wasPlaying: boolean } | null>(null);
    const currentTranslateXRef = useRef(0);
    const currentVerticalTransformRef = useRef({ translateY: 0, scale: 1, opacity: 1 });
    // const [activePointers, setActivePointers] = useState<Set<number>>(new Set());

    const getVideoSource = useCallback(
      (asset?: Asset | null) => asset?.preview || asset?.file || asset?.url || '',
      []
    );

    const getPreloadTarget = useCallback((asset?: Asset | null) => {
      if (!asset) return null;
      if (isVideoAsset(asset)) {
        return (
          asset.thumbnail || asset.thumbnailUrl || asset.preview || asset.file || asset.url || null
        );
      }
      return asset.file || asset.url || null;
    }, []);

    const clearResumeAfterSeekTimer = useCallback(() => {
      if (resumeAfterSeekTimerRef.current) {
        clearTimeout(resumeAfterSeekTimerRef.current);
        resumeAfterSeekTimerRef.current = null;
      }
    }, []);

    const handlePausedSeekFrameFlushed = useCallback(
      (video: HTMLVideoElement, targetTime: number) => {
        setVideoState((prev) => ({
          ...prev,
          currentTime: getFiniteVideoCurrentTime(video, targetTime),
          duration: getFiniteVideoDuration(video, prev.duration),
          isPlaying: false,
          muted: video.muted,
          volume: video.volume,
        }));
      },
      []
    );

    const {
      cancelPausedSeekFrameFlush,
      getPausedSeekFrameFlushRestore,
      isPausedSeekFrameFlushActive,
      schedulePausedSeekFrameFlush,
    } = useVideoPausedSeekFrameFlush({
      currentVideoRef,
      onFlushComplete: handlePausedSeekFrameFlushed,
    });

    // Direct DOM update function for high performance
    const updateDOMTransforms = useCallback(
      (translateXValue?: number) => {
        const xValue =
          translateXValue !== undefined ? translateXValue : currentTranslateXRef.current;
        const totalTranslateX = gestureTransform.translateX + xValue;
        const verticalTransform = currentVerticalTransformRef.current;

        const finalTranslateY = gestureTransform.translateY + verticalTransform.translateY;
        const finalScale = gestureTransform.scale * verticalTransform.scale;
        const finalOpacity = gestureTransform.opacity * verticalTransform.opacity;

        // Use container width (visible content area) instead of window width
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth;

        // Calculate blur based on vertical drag progress
        const blurAmount =
          verticalTransform.translateY > 0
            ? Math.min(20, (Math.abs(verticalTransform.translateY) / window.innerHeight) * 40) // Max 20px blur
            : 0;

        if (currentAssetRef.current) {
          currentAssetRef.current.style.transform = `translate3d(${totalTranslateX}px, ${finalTranslateY}px, 0) scale(${finalScale})`;
          currentAssetRef.current.style.transformOrigin = 'center bottom'; // Scale from bottom center
          currentAssetRef.current.style.opacity = String(finalOpacity);
          currentAssetRef.current.style.filter = blurAmount > 0 ? `blur(${blurAmount}px)` : '';
        }

        if (nextAssetRef.current) {
          // Next page sits on the left to align with forward direction (left)
          nextAssetRef.current.style.transform = `translate3d(${
            totalTranslateX - containerWidth
          }px, ${finalTranslateY}px, 0) scale(${finalScale})`;
          nextAssetRef.current.style.transformOrigin = 'center bottom';
          nextAssetRef.current.style.opacity = String(finalOpacity);
          nextAssetRef.current.style.filter = blurAmount > 0 ? `blur(${blurAmount}px)` : '';
        }

        if (prevAssetRef.current) {
          // Previous page sits on the right
          prevAssetRef.current.style.transform = `translate3d(${
            totalTranslateX + containerWidth
          }px, ${finalTranslateY}px, 0) scale(${finalScale})`;
          prevAssetRef.current.style.transformOrigin = 'center bottom';
          prevAssetRef.current.style.opacity = String(finalOpacity);
          prevAssetRef.current.style.filter = blurAmount > 0 ? `blur(${blurAmount}px)` : '';
        }
      },
      [gestureTransform]
    );

    // Handle video play/pause toggle (mute stateは変更しない)
    const handleVideoToggle = useCallback(
      (video: HTMLVideoElement, _assetFile: string) => {
        const shouldPlay = video.paused || isPausedSeekFrameFlushActive();
        cancelPausedSeekFrameFlush({ keepPlayback: true });
        clearResumeAfterSeekTimer();
        frameStepTargetTimeRef.current = null;
        pendingSeekTimeRef.current = null;
        // デバッグログ
        console.log('Video toggled:', {
          paused: video.paused,
          muted: video.muted,
          src: video.src,
        });
        // mute自動変更は行わない（UIのスピーカーボタンで操作）

        if (shouldPlay) {
          video
            .play()
            .then(() => {
              console.log('Video playing');
            })
            .catch((err) => {
              console.error('Video play failed:', err);
            });
        } else {
          video.pause();
          console.log('Video paused');
        }
      },
      [cancelPausedSeekFrameFlush, clearResumeAfterSeekTimer, isPausedSeekFrameFlushActive]
    );

    const stopVideoShuttle = useCallback(() => {
      const hadActiveShuttle =
        shuttleAnimationFrameRef.current !== null || shuttleRestoreMutedRef.current !== null;
      if (shuttleAnimationFrameRef.current !== null) {
        cancelAnimationFrame(shuttleAnimationFrameRef.current);
        shuttleAnimationFrameRef.current = null;
      }
      shuttleLastTimestampRef.current = null;

      const video = currentVideoRef.current;
      const restoreMuted = shuttleRestoreMutedRef.current;
      shuttleRestoreMutedRef.current = null;
      if (!hadActiveShuttle) return;
      if (!video) return;

      if (restoreMuted !== null) {
        video.muted = restoreMuted;
      }
      video.pause();
      setVideoState((prev) => ({
        ...prev,
        currentTime: getFiniteVideoCurrentTime(video, prev.currentTime),
        isPlaying: false,
        muted: video.muted,
      }));
    }, []);

    const handleVideoShuttleStart = useCallback(
      (direction: -1 | 1) => {
        stopVideoShuttle();
        cancelPausedSeekFrameFlush();

        const video = currentVideoRef.current;
        if (!video) return;

        clearResumeAfterSeekTimer();
        frameStepTargetTimeRef.current = null;
        pendingSeekTimeRef.current = null;
        isScrubbingRef.current = false;
        setIsScrubbing(false);
        shuttleRestoreMutedRef.current = video.muted;
        video.muted = true;
        video.pause();
        setVideoState((prev) => ({ ...prev, isPlaying: false, muted: true }));

        const step = (timestamp: number) => {
          if (currentVideoRef.current !== video) {
            stopVideoShuttle();
            return;
          }

          const lastTimestamp = shuttleLastTimestampRef.current ?? timestamp;
          shuttleLastTimestampRef.current = timestamp;
          const elapsedSeconds = Math.max(0, (timestamp - lastTimestamp) / 1000);
          const duration = getFiniteVideoDuration(video, videoState.duration);
          const nextTime = clampVideoTime(
            getFiniteVideoCurrentTime(video, 0) + direction * elapsedSeconds * VIDEO_SHUTTLE_RATE,
            duration
          );

          if (Number.isFinite(nextTime)) {
            video.currentTime = nextTime;
            setVideoState((prev) => ({
              ...prev,
              currentTime: nextTime,
              duration: Number.isFinite(duration) ? duration : prev.duration,
              isPlaying: false,
            }));
          }

          shuttleAnimationFrameRef.current = requestAnimationFrame(step);
        };

        shuttleAnimationFrameRef.current = requestAnimationFrame(step);
      },
      [cancelPausedSeekFrameFlush, clearResumeAfterSeekTimer, stopVideoShuttle, videoState.duration]
    );

    const handleVideoStepFrame = useCallback(
      (direction: -1 | 1) => {
        stopVideoShuttle();

        const video = currentVideoRef.current;
        if (!video) return;

        clearResumeAfterSeekTimer();
        pendingSeekTimeRef.current = null;
        isScrubbingRef.current = false;
        setIsScrubbing(false);

        const duration = getFiniteVideoDuration(video, videoState.duration);
        const frameStep = 1 / (fps || 30);
        const currentTime = getFiniteVideoCurrentTime(video, videoState.currentTime);
        const baseTime = frameStepTargetTimeRef.current ?? currentTime;
        const nextTime = clampVideoTime(baseTime + direction * frameStep, duration);

        video.pause();
        frameStepTargetTimeRef.current = nextTime;
        video.currentTime = nextTime;
        setVideoState((prev) => ({
          ...prev,
          currentTime: nextTime,
          duration: Number.isFinite(duration) ? duration : prev.duration,
          isPlaying: false,
        }));
        schedulePausedSeekFrameFlush(video, nextTime);
      },
      [
        clearResumeAfterSeekTimer,
        fps,
        schedulePausedSeekFrameFlush,
        stopVideoShuttle,
        videoState.currentTime,
        videoState.duration,
      ]
    );

    const handleTransportPlay = useCallback(() => {
      stopVideoShuttle();

      const video = currentVideoRef.current;
      if (!video) return;
      handleVideoToggle(video, currentAsset?.file || '');
    }, [currentAsset, handleVideoToggle, stopVideoShuttle]);

    const handleTransportStepBackward = useCallback(() => {
      handleVideoStepFrame(-1);
    }, [handleVideoStepFrame]);

    const handleTransportStepForward = useCallback(() => {
      handleVideoStepFrame(1);
    }, [handleVideoStepFrame]);

    // Expose imperative methods to parent
    // 動画フレームステップは設定FPSに従う

    useImperativeHandle(
      ref,
      () => ({
        updateTranslateX: (value: number) => {
          currentTranslateXRef.current = value;
          updateDOMTransforms(value);
        },
        updateVerticalTransform: (
          translateY: number,
          scale: number,
          opacity: number,
          backgroundProgress = 0
        ) => {
          currentVerticalTransformRef.current = { translateY, scale, opacity };

          // Update background color based on progress (black to white)
          if (backgroundRef.current) {
            const colorValue = Math.round(backgroundProgress * 255);
            backgroundRef.current.style.backgroundColor = `rgb(${colorValue}, ${colorValue}, ${colorValue})`;
          }

          updateDOMTransforms();
        },
        getViewportWidth: () => containerRef.current?.clientWidth || window.innerWidth,
        getCurrentImageElement: () => {
          const el = currentAssetRef.current?.querySelector('img');
          return (el as HTMLImageElement) || null;
        },
        getCurrentZoomMediaElement: () => {
          if (currentVideoRef.current) return currentVideoRef.current;
          const el = currentAssetRef.current?.querySelector('img');
          return (el as HTMLImageElement) || null;
        },
        getCurrentImageSurfaceElement: () => currentImageSurfaceRef.current,
        isCurrentVideo: () => !!currentVideoRef.current,
        toggleVideo: () => {
          const v = currentVideoRef.current;
          if (!v) return;
          const file = currentAsset?.file || '';
          handleVideoToggle(v, file);
        },
        pauseVideo: () => {
          const v = currentVideoRef.current;
          if (!v) return;
          if (!v.paused) v.pause();
        },
        playVideo: () => {
          const v = currentVideoRef.current;
          if (!v) return;
          cancelPausedSeekFrameFlush({ keepPlayback: true });
          if (v.paused) void v.play().catch(() => {});
        },
        seekBySeconds: (delta: number, preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          clearResumeAfterSeekTimer();
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          const wasPlaying = !v.paused;
          const dur = getFiniteVideoDuration(v, 0);
          const nt = clampVideoTime(getFiniteVideoCurrentTime(v, 0) + delta, dur);
          v.currentTime = nt;
          // UIの即時反映
          setVideoState((prev) => ({ ...prev, currentTime: nt, duration: dur }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
          if (v.paused) schedulePausedSeekFrameFlush(v, nt);
        },
        seekTo: (time: number, preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          clearResumeAfterSeekTimer();
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          const wasPlaying = !v.paused;
          const dur = getFiniteVideoDuration(v, 0);
          const nt = clampVideoTime(time, dur);
          v.currentTime = nt;
          setVideoState((prev) => ({ ...prev, currentTime: nt, duration: dur }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
          if (v.paused) schedulePausedSeekFrameFlush(v, nt);
        },
        stepFrame: (n: number) => {
          handleVideoStepFrame(n < 0 ? -1 : 1);
        },
        seekToStart: (preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          clearResumeAfterSeekTimer();
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          const wasPlaying = !v.paused;
          v.currentTime = 0;
          setVideoState((prev) => ({ ...prev, currentTime: 0 }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
          if (v.paused) schedulePausedSeekFrameFlush(v, 0);
        },
        seekToEnd: (preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          clearResumeAfterSeekTimer();
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          const wasPlaying = !v.paused;
          const dur = getFiniteVideoDuration(v, 0);
          const frameStep = 1 / (fps || 30);
          const endTime = Math.max(0, dur - frameStep);
          v.currentTime = endTime;
          setVideoState((prev) => ({ ...prev, currentTime: endTime, duration: dur }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
          if (v.paused) schedulePausedSeekFrameFlush(v, endTime);
        },
        getCurrentTime: () => {
          const v = currentVideoRef.current;
          return v?.currentTime ?? videoState.currentTime ?? 0;
        },
        getIsPlaying: () => {
          const v = currentVideoRef.current;
          return v ? !v.paused && !isPausedSeekFrameFlushActive() : !!videoState.isPlaying;
        },
        downloadCurrentVideoFrame: async () => {
          const v = currentVideoRef.current;
          if (!v || v.readyState < 2) return false;

          const width = v.videoWidth;
          const height = v.videoHeight;
          if (width <= 0 || height <= 0) return false;

          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) return false;

            context.drawImage(v, 0, 0, width, height);
            const blob = await canvasToPngBlob(canvas);
            if (!blob) return false;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = getFrameFilename(currentAsset, v.currentTime);
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            return true;
          } catch (error) {
            console.error('Failed to download current video frame:', error);
            return false;
          }
        },
        requestRestorePlayback: (payload) => {
          cancelPausedSeekFrameFlush();
          clearResumeAfterSeekTimer();
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          pendingRestoreRef.current = payload ?? { ...lastPlaybackRef.current };
          const v = currentVideoRef.current;
          if (v && v.readyState >= 1) {
            // メタデータがあれば即適用（pendingは残し、後続の予期せぬ再レンダにも対応）
            const dur = getFiniteVideoDuration(v, 0);
            const pl = pendingRestoreRef.current!;
            const clamped = clampVideoTime(pl.time, dur);
            v.currentTime = clamped;
            setVideoState((prev) => ({
              ...prev,
              currentTime: clamped,
              duration: dur,
              muted: v.muted,
              volume: v.volume,
            }));
            if (pl.wasPlaying) void v.play().catch(() => {});
            else {
              v.pause();
              schedulePausedSeekFrameFlush(v, clamped);
            }
          }
        },
      }),
      [
        updateDOMTransforms,
        cancelPausedSeekFrameFlush,
        clearResumeAfterSeekTimer,
        fps,
        backgroundRef.current,
        currentAsset?.file,
        currentAsset,
        handleVideoToggle,
        handleVideoStepFrame,
        isPausedSeekFrameFlushActive,
        schedulePausedSeekFrameFlush,
        videoState.currentTime,
        videoState.isPlaying,
      ]
    );

    // Preload images
    useEffect(() => {
      const targets = [currentAsset, nextAsset, prevAsset]
        .map((asset) => getPreloadTarget(asset))
        .filter(Boolean) as string[];

      for (const src of targets) {
        if (!loadedImages.has(src)) {
          const img = new Image();
          img.onload = () => {
            setLoadedImages((prev) => new Set(prev).add(src));
          };
          img.src = src;
        }
      }
    }, [currentAsset, nextAsset, prevAsset, loadedImages, getPreloadTarget]);

    // Handle click for navigation
    const handleContainerClick = useCallback(
      (e: React.MouseEvent) => {
        if (onImageClick) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            onImageClick(x / rect.width, y / rect.height);
          }
        }
      },
      [onImageClick]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (onImageClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          // Simulate click in the center for keyboard users
          onImageClick(0.5, 0.5);
        }
      },
      [onImageClick]
    );

    // Update DOM transforms when translateX or gestureTransform changes
    useEffect(() => {
      updateDOMTransforms(translateX);
    }, [translateX, updateDOMTransforms]);

    const assetTransformKey = `${currentAsset?.id ?? 'none'}:${nextAsset?.id ?? 'none'}:${prevAsset?.id ?? 'none'}`;

    // ページが切り替わった直後にも、再利用されたDOMへ現在の位置を同期する
    useLayoutEffect(() => {
      if (!assetTransformKey) return;
      updateDOMTransforms(currentTranslateXRef.current);
    }, [assetTransformKey, updateDOMTransforms]);

    // Recompute transforms on container resize to keep offsets correct with side panels
    useEffect(() => {
      if (!containerRef.current) return;
      const ro = new ResizeObserver(() => {
        updateDOMTransforms();
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, [updateDOMTransforms]);

    const currentVideoAutoplayKey = useMemo(() => {
      if (!currentAsset || !isVideoAsset(currentAsset)) return null;
      const src = getVideoSource(currentAsset);
      return `${currentAsset.id}:${src ? stripUrlParams(src) : ''}`;
    }, [
      currentAsset?.id,
      currentAsset?.preview,
      currentAsset?.file,
      currentAsset?.url,
      currentAsset,
      getVideoSource,
    ]);

    // Auto-play only when the displayed video identity changes.
    useEffect(() => {
      setVideoState((prev) => ({
        ...prev,
        currentTime: prev.currentTime ?? 0,
        duration: prev.duration ?? 0,
      }));

      if (!currentVideoAutoplayKey) {
        autoplayVideoKeyRef.current = null;
        return;
      }

      if (autoplayVideoKeyRef.current === currentVideoAutoplayKey) return;
      autoplayVideoKeyRef.current = currentVideoAutoplayKey;

      const timerId = setTimeout(() => {
        if (pendingRestoreRef.current) return;
        const videoElement = currentVideoRef.current;
        if (videoElement?.paused) {
          videoElement.play().catch((err) => {
            console.log('Video autoplay failed:', err);
          });
        }
      }, 100);

      return () => clearTimeout(timerId);
    }, [currentVideoAutoplayKey]);

    // ミュート切り替え（video要素の再生成を避ける）
    const handleToggleMute = useCallback(() => {
      const v = currentVideoRef.current;
      if (!v) return;
      const next = !getViewerMuted();
      setViewerMuted(next);
      v.muted = next;
      setVideoState((prev) => ({ ...prev, muted: next, volume: v.volume }));
    }, []);

    const handleVolumeChange = useCallback((nextVolume: number) => {
      const normalizedVolume = Math.min(Math.max(nextVolume, 0), 1);
      const nextMuted = normalizedVolume <= 0;
      setViewerVolume(normalizedVolume);
      setViewerMuted(nextMuted);

      const v = currentVideoRef.current;
      if (v) {
        v.volume = normalizedVolume;
        v.muted = nextMuted;
      }

      setVideoState((prev) => ({
        ...prev,
        muted: nextMuted,
        volume: normalizedVolume,
      }));
    }, []);

    // FPS toggle
    const handleToggleFps = useCallback(() => {
      const next = cycleViewerFps(fps);
      setFps(next);
    }, [fps]);

    // シンプルな rAF ループ: 常時1本だけ回し、video 要素の状態をUIへ反映
    useEffect(() => {
      let rafId: number;
      const loop = () => {
        const v = currentVideoRef.current;
        if (v) {
          const dur = getFiniteVideoDuration(v, 0);
          const pendingSeekTime = pendingSeekTimeRef.current;
          const frameStepTargetTime = frameStepTargetTimeRef.current;
          const pausedSeekFlushRestore = getPausedSeekFrameFlushRestore();
          const isPausedSeekFlush = isPausedSeekFrameFlushActive();
          const isPlaying = !v.paused && !isPausedSeekFlush;
          const muted =
            isPausedSeekFlush && pausedSeekFlushRestore ? pausedSeekFlushRestore.muted : v.muted;
          const volume =
            isPausedSeekFlush && pausedSeekFlushRestore ? pausedSeekFlushRestore.volume : v.volume;
          const ct =
            isScrubbingRef.current && pendingSeekTime !== null
              ? pendingSeekTime
              : frameStepTargetTime !== null && v.paused
                ? frameStepTargetTime
                : getFiniteVideoCurrentTime(v, 0);
          setVideoState((prev) => {
            if (
              prev.currentTime === ct &&
              prev.duration === dur &&
              prev.isPlaying === isPlaying &&
              prev.muted === muted &&
              prev.volume === volume
            )
              return prev;
            return {
              ...prev,
              currentTime: ct,
              duration: dur,
              isPlaying,
              muted,
              volume,
            };
          });
          lastPlaybackRef.current = {
            time:
              isScrubbingRef.current || frameStepTargetTime !== null
                ? ct
                : getFiniteVideoCurrentTime(v, 0),
            wasPlaying: isScrubbingRef.current ? wasPlayingBeforeScrubRef.current : isPlaying,
          };
        }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    }, [getPausedSeekFrameFlushRestore, isPausedSeekFrameFlushActive]);

    const _tryApplyRestore = useCallback(() => {
      const payload = pendingRestoreRef.current;
      const v = currentVideoRef.current;
      if (!payload || !v) return false;
      if (v.readyState < 1) return false; // HAVE_METADATA 未満
      cancelPausedSeekFrameFlush();
      frameStepTargetTimeRef.current = null;
      pendingSeekTimeRef.current = null;
      const dur = getFiniteVideoDuration(
        v,
        Number.isFinite(videoState.duration) ? videoState.duration : 0
      );
      const clamped = clampVideoTime(payload.time, dur);
      v.currentTime = clamped;
      setVideoState((prev) => ({
        ...prev,
        currentTime: clamped,
        duration: dur,
        muted: v.muted,
        volume: v.volume,
      }));
      if (payload.wasPlaying) void v.play().catch(() => {});
      else {
        v.pause();
        schedulePausedSeekFrameFlush(v, clamped);
      }
      pendingRestoreRef.current = null;
      return true;
    }, [cancelPausedSeekFrameFlush, schedulePausedSeekFrameFlush, videoState.duration]);

    // 追加のrAF起動管理は不要（常時1本のループで更新）

    // Handle video metadata loaded
    const handleVideoLoadedMetadata = useCallback((video: HTMLVideoElement) => {
      setVideoState((prev) => ({
        ...prev,
        duration: video.duration,
        currentTime: video.currentTime,
        isPlaying: !video.paused,
        muted: video.muted,
        volume: video.volume,
      }));
    }, []);

    // Handle seek to specific time
    const seekVideoTo = useCallback(
      (seekTime: number) => {
        const video = currentVideoRef.current;
        if (video) {
          const duration = getFiniteVideoDuration(video, videoState.duration);
          const clamped = clampVideoTime(seekTime, duration);
          if (!isScrubbingRef.current) {
            clearResumeAfterSeekTimer();
          }
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = isScrubbingRef.current ? clamped : null;
          video.currentTime = clamped;
          setVideoState((prev) => ({
            ...prev,
            currentTime: clamped,
            duration: Number.isFinite(duration) ? duration : prev.duration,
          }));
          if (!isScrubbingRef.current && video.paused) {
            schedulePausedSeekFrameFlush(video, clamped);
          }
        }
      },
      [clearResumeAfterSeekTimer, schedulePausedSeekFrameFlush, videoState.duration]
    );

    const handleSeek = useCallback(
      (seekTime: number) => {
        seekVideoTo(seekTime);
      },
      [seekVideoTo]
    );

    const handleScrubStart = useCallback(() => {
      const video = currentVideoRef.current;
      if (!video) return;
      cancelPausedSeekFrameFlush();
      if (resumeAfterSeekTimerRef.current) {
        clearTimeout(resumeAfterSeekTimerRef.current);
        resumeAfterSeekTimerRef.current = null;
      }
      wasPlayingBeforeScrubRef.current = !video.paused;
      isScrubbingRef.current = true;
      pendingSeekTimeRef.current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      if (!video.paused) video.pause();
      setIsScrubbing(true);
    }, [cancelPausedSeekFrameFlush]);

    const handleScrubEnd = useCallback(
      (time: number) => {
        const video = currentVideoRef.current;
        if (!video) {
          isScrubbingRef.current = false;
          pendingSeekTimeRef.current = null;
          setIsScrubbing(false);
          return;
        }

        seekVideoTo(time);
        const shouldResume = wasPlayingBeforeScrubRef.current;
        const resumePlayback = () => {
          if (currentVideoRef.current !== video) return;
          isScrubbingRef.current = false;
          pendingSeekTimeRef.current = null;
          setIsScrubbing(false);
          if (shouldResume) {
            void video.play().catch(() => {});
          } else {
            schedulePausedSeekFrameFlush(video, time);
          }
        };

        if (resumeAfterSeekTimerRef.current) {
          clearTimeout(resumeAfterSeekTimerRef.current);
        }

        let resumed = false;
        const finish = () => {
          if (resumed) return;
          resumed = true;
          video.removeEventListener('seeked', finish);
          if (resumeAfterSeekTimerRef.current) {
            clearTimeout(resumeAfterSeekTimerRef.current);
            resumeAfterSeekTimerRef.current = null;
          }
          resumePlayback();
        };

        video.addEventListener('seeked', finish);
        resumeAfterSeekTimerRef.current = setTimeout(finish, 180);
      },
      [schedulePausedSeekFrameFlush, seekVideoTo]
    );

    useEffect(() => {
      return () => {
        if (resumeAfterSeekTimerRef.current) {
          clearTimeout(resumeAfterSeekTimerRef.current);
        }
        if (shuttleAnimationFrameRef.current !== null) {
          cancelAnimationFrame(shuttleAnimationFrameRef.current);
        }
        cancelPausedSeekFrameFlush();
      };
    }, [cancelPausedSeekFrameFlush]);

    // Calculate initial styles (transforms will be handled by direct DOM manipulation)
    const getImageStyle = (position: 'current' | 'next' | 'prev') => {
      const opacity = gestureTransform.opacity;
      const shouldShowNeighbor = gestureTransform.scale === 1 && zoomTransform.scale === 1;

      switch (position) {
        case 'current':
          return {
            opacity,
            willChange: 'transform', // Optimize for frequent transform changes
          };
        case 'next':
          return {
            opacity: shouldShowNeighbor ? opacity : 0,
            willChange: 'transform',
          };
        case 'prev':
          return {
            opacity: shouldShowNeighbor ? opacity : 0,
            willChange: 'transform',
          };
      }
    };

    const releaseOwnedVideo = useCallback(() => {
      cancelPausedSeekFrameFlush();
      frameStepTargetTimeRef.current = null;
      pendingSeekTimeRef.current = null;
      const video = ownedVideoRef.current;
      if (video?.parentElement) {
        try {
          video.parentElement.removeChild(video);
        } catch {}
      }
      ownedVideoRef.current = null;
      currentVideoRef.current = null;
      currentVideoSrcRef.current = null;
    }, [cancelPausedSeekFrameFlush]);

    // Keep a stable ref callback for hosting the current video element
    const setCurrentVideoHost = useCallback((el: HTMLDivElement | null) => {
      currentVideoHostRef.current = el;
      if (!el) return;
      // If we already own a video element, ensure it's attached to the new host
      const v = ownedVideoRef.current;
      if (v && v.parentElement !== el) {
        try {
          el.innerHTML = '';
        } catch {}
        el.appendChild(v);
      }
    }, []);

    const renderAsset = (asset: Asset | undefined, position: 'current' | 'next' | 'prev') => {
      if (!asset) return null;

      const style = getImageStyle(position);
      const isVideo = isVideoAsset(asset);
      const source = getVideoSource(asset);
      const dragStyle: DragImageStyle | undefined = !isVideo
        ? {
            cursor: nativeDragEnabled ? 'grab' : 'default',
            WebkitUserDrag: nativeDragEnabled ? 'element' : 'none',
          }
        : undefined;
      const isCurrentImage = position === 'current' && !isVideo;
      const isCurrentZoomTarget = position === 'current';
      const zoomStyle: CSSProperties | undefined = isCurrentZoomTarget
        ? {
            transform: `translate3d(${zoomTransform.translateX}px, ${zoomTransform.translateY}px, 0) scale(${zoomTransform.scale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }
        : undefined;

      // Get the appropriate ref for this position
      const getRef = () => {
        switch (position) {
          case 'current':
            return currentAssetRef;
          case 'next':
            return nextAssetRef;
          case 'prev':
            return prevAssetRef;
        }
      };

      // 現在表示の動画のみ、ネイティブ要素を手動で保持して再マウントを避ける
      if (isVideo && position === 'current') {
        return (
          <div
            ref={getRef()}
            className="absolute inset-0 flex items-center justify-center"
            style={style}
          >
            <div
              ref={currentImageSurfaceRef}
              className="max-w-full max-h-full w-full h-full flex items-center justify-center"
            >
              <div
                ref={setCurrentVideoHost}
                className="max-w-full max-h-full w-full h-full"
                style={zoomStyle}
              />
            </div>
          </div>
        );
      }

      // それ以外は従来どおり
      return (
        <div
          ref={getRef()}
          className="absolute inset-0 flex items-center justify-center"
          style={style}
        >
          {isVideo ? (
            <video
              key={position === 'next' ? 'next-video' : 'prev-video'}
              src={source || ''}
              className="max-w-full max-h-full w-full h-full object-contain"
              controls={false}
              playsInline
              loop
              muted
              preload="metadata"
              poster={asset.thumbnail || asset.thumbnailUrl || undefined}
            />
          ) : (
            <div
              ref={isCurrentImage ? currentImageSurfaceRef : undefined}
              className="max-w-full max-h-full w-full h-full flex items-center justify-center"
            >
              <div className="w-full h-full flex items-center justify-center" style={zoomStyle}>
                <img
                  src={source || ''}
                  alt={asset.preview || asset.file || asset.url || ''}
                  className="max-w-full max-h-full w-full h-full object-contain select-none"
                  draggable={nativeDragEnabled}
                  style={dragStyle}
                />
              </div>
            </div>
          )}
        </div>
      );
    };

    const isCurrentVideo = isVideoAsset(currentAsset);
    const currentPreloadKey = getPreloadTarget(currentAsset);
    const shouldShowLoader = Boolean(
      currentAsset && currentPreloadKey && !loadedImages.has(currentPreloadKey)
    );
    const _currentAssetIdKey = useMemo(
      () => (currentAsset ? String(currentAsset.id) : null),
      [currentAsset?.id, currentAsset]
    );
    const _currentVideoBaseSrc = useMemo(() => {
      if (!isCurrentVideo || !currentAsset) return null;
      const src = getVideoSource(currentAsset);
      return src ? stripUrlParams(src) : null;
    }, [
      isCurrentVideo,
      currentAsset?.preview,
      currentAsset?.file,
      currentAsset?.url,
      currentAsset,
      getVideoSource,
    ]);

    // 現在動画のホストに、ネイティブ video 要素を安定配置（再レンダで破棄しない）
    useEffect(() => {
      const asset = currentAsset;
      if (!asset) {
        stopVideoShuttle();
        releaseOwnedVideo();
        return;
      }
      const isVideo = isVideoAsset(asset);

      // 非動画になったら、ホストの有無に関係なく保持中の video を解放する
      if (!isVideo) {
        stopVideoShuttle();
        releaseOwnedVideo();
        return;
      }

      const host = currentVideoHostRef.current;
      if (!host) return;

      const rawSrc = getVideoSource(asset);
      const normalizedSrc = rawSrc ? stripUrlParams(rawSrc) : '';
      // 既存 video があり、同じ src なら再利用（ホストが変わっても再アタッチ）
      if (ownedVideoRef.current && currentVideoSrcRef.current === normalizedSrc) {
        const v = ownedVideoRef.current;
        currentVideoRef.current = v;
        if (v.parentElement !== host) {
          try {
            host.innerHTML = '';
          } catch {}
          host.appendChild(v);
        }
        // 可能なら直ちに再生状態を復元（pending → last の順で優先）
        const payload = pendingRestoreRef.current ?? lastPlaybackRef.current;
        if (payload) {
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          const dur = getFiniteVideoDuration(v, 0);
          const clamped = clampVideoTime(payload.time || 0, dur);
          if (Number.isFinite(clamped)) {
            v.currentTime = clamped;
            setVideoState((prev) => ({
              ...prev,
              currentTime: clamped,
              duration: dur,
              isPlaying: payload.wasPlaying,
              muted: v.muted,
              volume: v.volume,
            }));
          }
          if (payload.wasPlaying) void v.play().catch(() => {});
          else {
            v.pause();
            schedulePausedSeekFrameFlush(v, clamped);
          }
          // pending は使い切り
          pendingRestoreRef.current = null;
        }
        return;
      }

      // 新規作成または差し替え
      const v = document.createElement('video');
      if (rawSrc) v.src = rawSrc;
      v.preload = 'metadata';
      v.playsInline = true;
      v.loop = true;
      v.controls = false;
      v.muted = getViewerMuted(); // グローバル設定に合わせる（既定: OFF）
      v.volume = getViewerVolume();
      v.className = 'max-w-full max-h-full w-full h-full object-contain cursor-pointer';

      const onLoaded = () => {
        handleVideoLoadedMetadata(v);
        // pending restore 優先
        const payload = pendingRestoreRef.current;
        if (payload && v.readyState >= 1) {
          frameStepTargetTimeRef.current = null;
          pendingSeekTimeRef.current = null;
          const dur = getFiniteVideoDuration(v, 0);
          const clamped = clampVideoTime(payload.time, dur);
          v.currentTime = clamped;
          setVideoState((prev) => ({
            ...prev,
            currentTime: clamped,
            duration: dur,
            muted: v.muted,
            volume: v.volume,
          }));
          if (payload.wasPlaying) void v.play().catch(() => {});
          else {
            v.pause();
            schedulePausedSeekFrameFlush(v, clamped);
          }
          pendingRestoreRef.current = null;
        } else {
          // pending が無い場合は、直近の再生状態に合わせる（初回の自動再生は別エフェクトで実行）
          const last = lastPlaybackRef.current;
          if (last) {
            frameStepTargetTimeRef.current = null;
            pendingSeekTimeRef.current = null;
            const dur = getFiniteVideoDuration(v, 0);
            const clamped = clampVideoTime(last.time || 0, dur);
            if (Number.isFinite(clamped)) {
              v.currentTime = clamped;
              setVideoState((prev) => ({
                ...prev,
                currentTime: clamped,
                duration: dur,
                isPlaying: last.wasPlaying,
              }));
            }
            if (last.wasPlaying) void v.play().catch(() => {});
            else {
              v.pause();
              schedulePausedSeekFrameFlush(v, clamped);
            }
          }
        }
      };
      const onDurationChange = () => {
        setVideoState((prev) => ({
          ...prev,
          duration: getFiniteVideoDuration(v, prev.duration),
          volume: v.volume,
        }));
      };
      const onLoadedData = () => {
        const frameStepTargetTime = frameStepTargetTimeRef.current;
        setVideoState((prev) => ({
          ...prev,
          duration: getFiniteVideoDuration(v, prev.duration),
          currentTime:
            frameStepTargetTime !== null && v.paused
              ? frameStepTargetTime
              : getFiniteVideoCurrentTime(v, prev.currentTime),
          volume: v.volume,
        }));
      };
      const onSeeked = () => {
        const pendingSeekTime = pendingSeekTimeRef.current;
        const frameStepTargetTime = frameStepTargetTimeRef.current;
        if (!isScrubbingRef.current) {
          pendingSeekTimeRef.current = null;
        }
        setVideoState((prev) => ({
          ...prev,
          currentTime:
            isScrubbingRef.current && pendingSeekTime !== null
              ? pendingSeekTime
              : frameStepTargetTime !== null
                ? frameStepTargetTime
                : getFiniteVideoCurrentTime(v, prev.currentTime),
        }));
      };
      const onPlay = () => {
        frameStepTargetTimeRef.current = null;
        pendingSeekTimeRef.current = null;
        const restore = getPausedSeekFrameFlushRestore();
        setVideoState((prev) => ({
          ...prev,
          isPlaying: !isPausedSeekFrameFlushActive(),
          muted: restore ? restore.muted : v.muted,
          volume: restore ? restore.volume : v.volume,
        }));
      };
      const onPause = () =>
        setVideoState((prev) => ({
          ...prev,
          isPlaying: false,
          muted: getPausedSeekFrameFlushRestore()?.muted ?? v.muted,
          volume: getPausedSeekFrameFlushRestore()?.volume ?? v.volume,
        }));
      const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        handleVideoToggle(v, getVideoSource(asset));
      };
      const onTouchEnd = (e: TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();
        handleVideoToggle(v, getVideoSource(asset));
      };

      v.addEventListener('loadedmetadata', onLoaded);
      v.addEventListener('durationchange', onDurationChange);
      v.addEventListener('loadeddata', onLoadedData);
      v.addEventListener('seeked', onSeeked);
      v.addEventListener('play', onPlay);
      v.addEventListener('pause', onPause);
      v.addEventListener('click', onClick);
      v.addEventListener('touchend', onTouchEnd);

      // 古い要素を除去して差し替え
      if (ownedVideoRef.current && ownedVideoRef.current.parentElement === host) {
        try {
          host.removeChild(ownedVideoRef.current);
        } catch {}
      }
      host.appendChild(v);
      ownedVideoRef.current = v;
      currentVideoRef.current = v;
      currentVideoSrcRef.current = normalizedSrc;

      return () => {
        v.removeEventListener('loadedmetadata', onLoaded);
        v.removeEventListener('durationchange', onDurationChange);
        v.removeEventListener('loadeddata', onLoadedData);
        v.removeEventListener('seeked', onSeeked);
        v.removeEventListener('play', onPlay);
        v.removeEventListener('pause', onPause);
        v.removeEventListener('click', onClick);
        v.removeEventListener('touchend', onTouchEnd);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      currentAsset,
      getVideoSource,
      handleVideoLoadedMetadata,
      handleVideoToggle,
      releaseOwnedVideo,
      getPausedSeekFrameFlushRestore,
      isPausedSeekFrameFlushActive,
      schedulePausedSeekFrameFlush,
      stopVideoShuttle,
    ]);

    return (
      <div
        ref={containerRef}
        className={cn('relative w-full h-full overflow-hidden bg-black', className)}
        onClick={handleContainerClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        // ★ COMMENTED OUT: Pointer event handlers - allowing only native browser interactions
        // onPointerDown={handlePointerDown}
        // onPointerMove={handlePointerMove}
        // onPointerUp={handlePointerUp}
        // onPointerCancel={handlePointerUp}
        style={{
          touchAction: 'auto', // ★ Allow all native touch interactions (pan, zoom, etc.)
        }}
      >
        {/* Video seek bar - show only for videos */}
        {isCurrentVideo &&
          uiInsets &&
          createPortal(
            <div
              className="fixed z-[100] pointer-events-auto"
              style={{
                top: uiInsets.top,
                left: uiInsets.left,
                right: uiInsets.right,
                touchAction: 'none',
              }}
            >
              <VideoSeekBar
                currentTime={videoState.currentTime}
                duration={videoState.duration}
                onSeek={handleSeek}
                onScrubStart={handleScrubStart}
                onScrubEnd={handleScrubEnd}
                muted={videoState.muted}
                onToggleMute={handleToggleMute}
                volume={videoState.volume}
                onVolumeChange={handleVolumeChange}
                fps={fps}
                onToggleFps={handleToggleFps}
                markers={markers ?? (currentAsset?.meta?.markers || [])}
                onEditMarkerRequest={onEditMarkerRequest}
                onMoveMarkerRequest={onMoveMarkerRequest}
                onDeleteMarkerRequest={onDeleteMarkerRequest}
                onChangeMarkerColorRequest={onChangeMarkerColorRequest}
              />
            </div>,
            document.body
          )}

        {/* Preload container for smoother transitions */}
        <div className="absolute inset-0">
          {renderAsset(prevAsset, 'prev')}
          {renderAsset(currentAsset, 'current')}
          {renderAsset(nextAsset, 'next')}
        </div>

        {isCurrentVideo && (
          <div
            className="pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2"
            style={{ bottom: 'max(4rem, calc(env(safe-area-inset-bottom) + 3rem))' }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              setIsTransportHovered(true);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return;
              setIsTransportHovered(false);
            }}
          >
            <VideoTransportControls
              hidden={videoState.isPlaying && !isTransportHovered}
              isPlaying={videoState.isPlaying}
              onPlay={handleTransportPlay}
              onStepBackward={handleTransportStepBackward}
              onStepForward={handleTransportStepForward}
              onShuttleStart={handleVideoShuttleStart}
              onShuttleEnd={stopVideoShuttle}
            />
          </div>
        )}

        {/* Loading indicators for images not yet loaded */}
        {shouldShowLoader && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }
);

ImageCarousel.displayName = 'ImageCarousel';

export default ImageCarousel;
