import type { CSSProperties } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import VideoSeekBar from '@/components/ui/SeekBar/VideoSeekBar';
import { isVideoAsset } from '@/lib/media';
import { cn } from '@/lib/utils';
import { cycleViewerFps, getViewerFps, getViewerMuted, setViewerMuted } from '@/lib/viewerSettings';
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
  /** Cmd押下中など、ネイティブのドラッグ＆ドロップを許可する */
  nativeDragEnabled?: boolean;
  /** シークバーの固定表示位置（オーバーレイより上に出すため） */
  uiInsets?: { top: number; left: number; right: number };
  /** マーカー編集リクエスト（SeekBar のダブルクリックから） */
  onEditMarkerRequest?: (marker: VideoMarker, index: number) => void;
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
  requestRestorePlayback: (payload?: { time: number; wasPlaying: boolean }) => void;
}

interface VideoState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
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
      uiInsets,
      onEditMarkerRequest,
    },
    ref
  ) => {
    const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
    const [videoState, setVideoState] = useState<VideoState>({
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      muted: getViewerMuted(),
    });
    const [fps, setFps] = useState<number>(getViewerFps());
    const [_isScrubbing, setIsScrubbing] = useState(false);
    const wasPlayingBeforeScrubRef = useRef<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const backgroundRef = containerRef; // Use container as background ref
    const currentAssetRef = useRef<HTMLDivElement>(null);
    const nextAssetRef = useRef<HTMLDivElement>(null);
    const prevAssetRef = useRef<HTMLDivElement>(null);
    const currentVideoRef = useRef<HTMLVideoElement | null>(null);
    const currentVideoHostRef = useRef<HTMLDivElement | null>(null);
    const ownedVideoRef = useRef<HTMLVideoElement | null>(null);
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
    const handleVideoToggle = useCallback((video: HTMLVideoElement, _assetFile: string) => {
      // デバッグログ
      console.log('Video toggled:', {
        paused: video.paused,
        muted: video.muted,
        src: video.src,
      });
      // mute自動変更は行わない（UIのスピーカーボタンで操作）

      if (video.paused) {
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
    }, []);

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
          if (v.paused) void v.play().catch(() => {});
        },
        seekBySeconds: (delta: number, preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          const wasPlaying = !v.paused;
          const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
          const nt = Math.min(Math.max((v.currentTime || 0) + delta, 0), Math.max(0, dur));
          v.currentTime = nt;
          // UIの即時反映
          setVideoState((prev) => ({ ...prev, currentTime: nt, duration: dur }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
        },
        seekTo: (time: number, preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          const wasPlaying = !v.paused;
          const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
          const nt = Math.min(Math.max(time, 0), Math.max(0, dur));
          v.currentTime = nt;
          setVideoState((prev) => ({ ...prev, currentTime: nt, duration: dur }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
        },
        stepFrame: (n: number) => {
          const v = currentVideoRef.current;
          if (!v) return;
          const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
          const frameStep = 1 / (fps || 30);
          const nt = Math.min(Math.max((v.currentTime || 0) + n * frameStep, 0), Math.max(0, dur));
          v.pause();
          v.currentTime = nt;
          setVideoState((prev) => ({ ...prev, currentTime: nt, duration: dur, isPlaying: false }));
        },
        seekToStart: (preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          const wasPlaying = !v.paused;
          v.currentTime = 0;
          setVideoState((prev) => ({ ...prev, currentTime: 0 }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
        },
        seekToEnd: (preservePlaying: boolean = true) => {
          const v = currentVideoRef.current;
          if (!v) return;
          const wasPlaying = !v.paused;
          const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
          const frameStep = 1 / (fps || 30);
          const endTime = Math.max(0, dur - frameStep);
          v.currentTime = endTime;
          setVideoState((prev) => ({ ...prev, currentTime: endTime, duration: dur }));
          if (preservePlaying) {
            if (wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
        },
        getCurrentTime: () => {
          const v = currentVideoRef.current;
          return v?.currentTime ?? videoState.currentTime ?? 0;
        },
        getIsPlaying: () => {
          const v = currentVideoRef.current;
          return v ? !v.paused : !!videoState.isPlaying;
        },
        requestRestorePlayback: (payload) => {
          pendingRestoreRef.current = payload ?? { ...lastPlaybackRef.current };
          const v = currentVideoRef.current;
          if (v && v.readyState >= 1) {
            // メタデータがあれば即適用（pendingは残し、後続の予期せぬ再レンダにも対応）
            const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
            const pl = pendingRestoreRef.current!;
            const clamped = Math.min(Math.max(pl.time, 0), Math.max(0, dur));
            v.currentTime = clamped;
            setVideoState((prev) => ({ ...prev, currentTime: clamped, duration: dur }));
            if (pl.wasPlaying) void v.play().catch(() => {});
            else v.pause();
          }
        },
      }),
      [
        updateDOMTransforms,
        videoState.duration,
        fps,
        backgroundRef.current,
        currentAsset?.file,
        handleVideoToggle,
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

    // Recompute transforms on container resize to keep offsets correct with side panels
    useEffect(() => {
      if (!containerRef.current) return;
      const ro = new ResizeObserver(() => {
        updateDOMTransforms();
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, [updateDOMTransforms]);

    // Auto-play video when current asset (id or file) changes
    useEffect(() => {
      // Guard: only reset when the actual asset identity changes (id/file)
      setVideoState((prev) => ({
        ...prev,
        currentTime: prev.currentTime ?? 0,
        duration: prev.duration ?? 0,
      }));

      if (currentAsset && isVideoAsset(currentAsset)) {
        // Give browser time to render the video element
        setTimeout(() => {
          const videoElement = currentAssetRef.current?.querySelector('video');
          if (videoElement?.paused) {
            videoElement.play().catch((err) => {
              console.log('Video autoplay failed:', err);
            });
          }
        }, 100);
      }
    }, [currentAsset?.id, currentAsset?.file, currentAsset?.preview, currentAsset]);

    // ミュート切り替え（video要素の再生成を避ける）
    const handleToggleMute = useCallback(() => {
      const v = currentVideoRef.current;
      if (!v) return;
      const next = !getViewerMuted();
      setViewerMuted(next);
      v.muted = next;
      setVideoState((prev) => ({ ...prev, muted: next }));
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
          const dur = Number.isFinite(v.duration) ? v.duration : 0;
          const ct = Number.isFinite(v.currentTime) ? v.currentTime : 0;
          setVideoState((prev) => {
            if (
              prev.currentTime === ct &&
              prev.duration === dur &&
              prev.isPlaying === !v.paused &&
              prev.muted === v.muted
            )
              return prev;
            return {
              ...prev,
              currentTime: ct,
              duration: dur,
              isPlaying: !v.paused,
              muted: v.muted,
            };
          });
          lastPlaybackRef.current = { time: v.currentTime || 0, wasPlaying: !v.paused };
        }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    }, []);

    const _tryApplyRestore = useCallback(() => {
      const payload = pendingRestoreRef.current;
      const v = currentVideoRef.current;
      if (!payload || !v) return false;
      if (v.readyState < 1) return false; // HAVE_METADATA 未満
      const dur = Number.isFinite(v.duration)
        ? v.duration
        : Number.isFinite(videoState.duration)
          ? videoState.duration
          : 0;
      const clamped = Math.min(Math.max(payload.time, 0), Math.max(0, dur));
      v.currentTime = clamped;
      setVideoState((prev) => ({ ...prev, currentTime: clamped, duration: dur }));
      if (payload.wasPlaying) void v.play().catch(() => {});
      else v.pause();
      pendingRestoreRef.current = null;
      return true;
    }, [videoState.duration]);

    // 追加のrAF起動管理は不要（常時1本のループで更新）

    // Handle video metadata loaded
    const handleVideoLoadedMetadata = useCallback((video: HTMLVideoElement) => {
      setVideoState((prev) => ({
        ...prev,
        duration: video.duration,
        currentTime: video.currentTime,
        isPlaying: !video.paused,
        muted: video.muted,
      }));
    }, []);

    // Handle seek to specific time
    const handleSeek = useCallback((seekTime: number) => {
      if (currentVideoRef.current) {
        currentVideoRef.current.currentTime = seekTime;
        setVideoState((prev) => ({
          ...prev,
          currentTime: seekTime,
        }));
      }
    }, []);

    // Calculate initial styles (transforms will be handled by direct DOM manipulation)
    const getImageStyle = (position: 'current' | 'next' | 'prev') => {
      const opacity = gestureTransform.opacity;

      switch (position) {
        case 'current':
          return {
            opacity,
            willChange: 'transform', // Optimize for frequent transform changes
          };
        case 'next':
          return {
            opacity: gestureTransform.scale === 1 ? opacity : 0,
            willChange: 'transform',
          };
        case 'prev':
          return {
            opacity: gestureTransform.scale === 1 ? opacity : 0,
            willChange: 'transform',
          };
      }
    };

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
            <div ref={setCurrentVideoHost} className="max-w-full max-h-full w-full h-full" />
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
            <img
              src={source || ''}
              alt={asset.preview || asset.file || asset.url || ''}
              className="max-w-full max-h-full w-full h-full object-contain select-none"
              draggable={nativeDragEnabled}
              style={dragStyle}
            />
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

    const currentVideoSrcRef = useRef<string | null>(null);

    // 現在動画のホストに、ネイティブ video 要素を安定配置（再レンダで破棄しない）
    useEffect(() => {
      const asset = currentAsset;
      if (!asset) return;
      const isVideo = isVideoAsset(asset);
      const host = currentVideoHostRef.current;
      if (!host) return;

      // 非動画になったら解放
      if (!isVideo) {
        if (ownedVideoRef.current && ownedVideoRef.current.parentElement === host) {
          try {
            host.removeChild(ownedVideoRef.current);
          } catch {}
        }
        ownedVideoRef.current = null;
        currentVideoRef.current = null;
        currentVideoSrcRef.current = null;
        return;
      }

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
          const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
          const clamped = Math.min(Math.max(payload.time || 0, 0), Math.max(0, dur));
          if (Number.isFinite(clamped)) {
            v.currentTime = clamped;
            setVideoState((prev) => ({
              ...prev,
              currentTime: clamped,
              duration: dur,
              isPlaying: payload.wasPlaying,
            }));
          }
          if (payload.wasPlaying) void v.play().catch(() => {});
          else v.pause();
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
      v.className = 'max-w-full max-h-full w-full h-full object-contain cursor-pointer';

      const onLoaded = () => {
        handleVideoLoadedMetadata(v);
        // pending restore 優先
        const payload = pendingRestoreRef.current;
        if (payload && v.readyState >= 1) {
          const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
          const clamped = Math.min(Math.max(payload.time, 0), Math.max(0, dur));
          v.currentTime = clamped;
          setVideoState((prev) => ({ ...prev, currentTime: clamped, duration: dur }));
          if (payload.wasPlaying) void v.play().catch(() => {});
          else v.pause();
          pendingRestoreRef.current = null;
        } else {
          // pending が無い場合は、直近の再生状態に合わせる（初回の自動再生は別エフェクトで実行）
          const last = lastPlaybackRef.current;
          if (last) {
            const dur = Number.isFinite(v.duration) ? v.duration : videoState.duration;
            const clamped = Math.min(Math.max(last.time || 0, 0), Math.max(0, dur));
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
            else v.pause();
          }
        }
      };
      const onDurationChange = () => {
        setVideoState((prev) => ({
          ...prev,
          duration: Number.isFinite(v.duration) ? v.duration : prev.duration,
        }));
      };
      const onLoadedData = () => {
        setVideoState((prev) => ({
          ...prev,
          duration: Number.isFinite(v.duration) ? v.duration : prev.duration,
          currentTime: Number.isFinite(v.currentTime) ? v.currentTime : prev.currentTime,
        }));
      };
      const onSeeked = () => {
        setVideoState((prev) => ({
          ...prev,
          currentTime: Number.isFinite(v.currentTime) ? v.currentTime : prev.currentTime,
        }));
      };
      const onPlay = () => {
        setVideoState((prev) => ({ ...prev, isPlaying: true }));
      };
      const onPause = () => setVideoState((prev) => ({ ...prev, isPlaying: false }));
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
      videoState.duration,
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
                onScrubStart={() => {
                  const v = currentVideoRef.current;
                  if (!v) return;
                  wasPlayingBeforeScrubRef.current = !v.paused;
                  if (!v.paused) v.pause();
                  setIsScrubbing(true);
                }}
                onScrubEnd={() => {
                  const v = currentVideoRef.current;
                  setIsScrubbing(false);
                  if (v && wasPlayingBeforeScrubRef.current) {
                    v.play().catch(() => {});
                  }
                }}
                muted={videoState.muted}
                onToggleMute={handleToggleMute}
                fps={fps}
                onToggleFps={handleToggleFps}
                markers={markers ?? (currentAsset?.meta?.markers || [])}
                onEditMarkerRequest={onEditMarkerRequest}
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
