import { type RefObject, useCallback, useRef } from 'react';

interface VideoFrameCallbackMetadataLike {
  mediaTime: number;
}

type VideoFrameCallbackLike = (now: number, metadata: VideoFrameCallbackMetadataLike) => void;

type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallbackLike) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

interface UseVideoPausedSeekFrameFlushOptions {
  currentVideoRef: RefObject<HTMLVideoElement | null>;
  onFlushComplete: (video: HTMLVideoElement, targetTime: number) => void;
}

const WEBKIT_PAUSED_SEEK_FLUSH_DELAY_MS = 120;
const WEBKIT_PAUSED_SEEK_FLUSH_RAF_COUNT = 2;

const getVideoFrameCallbackApi = (
  video: HTMLVideoElement
): VideoElementWithFrameCallback | null => {
  const candidate: VideoElementWithFrameCallback = video;
  return typeof candidate.requestVideoFrameCallback === 'function' ? candidate : null;
};

const shouldFlushPausedSeekFrame = () => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent;
  if (!userAgent.includes('AppleWebKit')) return false;
  return !/(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|OPR|OPiOS)/.test(userAgent);
};

export function useVideoPausedSeekFrameFlush({
  currentVideoRef,
  onFlushComplete,
}: UseVideoPausedSeekFrameFlushOptions) {
  const pausedSeekFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedSeekFlushRafRef = useRef<number | null>(null);
  const pausedSeekFlushFrameCallbackRef = useRef<{
    video: VideoElementWithFrameCallback;
    handle: number;
  } | null>(null);
  const pausedSeekFlushTokenRef = useRef(0);
  const pausedSeekFlushRestoreRef = useRef<{
    muted: boolean;
    volume: number;
    playbackRate: number;
  } | null>(null);
  const isPausedSeekFlushRef = useRef(false);

  const cancelPausedSeekFrameFlush = useCallback(
    (options?: { keepPlayback?: boolean }) => {
      pausedSeekFlushTokenRef.current += 1;
      const wasFlushing = isPausedSeekFlushRef.current;

      if (pausedSeekFlushTimerRef.current) {
        clearTimeout(pausedSeekFlushTimerRef.current);
        pausedSeekFlushTimerRef.current = null;
      }

      if (pausedSeekFlushRafRef.current !== null) {
        cancelAnimationFrame(pausedSeekFlushRafRef.current);
        pausedSeekFlushRafRef.current = null;
      }

      const pendingFrameCallback = pausedSeekFlushFrameCallbackRef.current;
      if (pendingFrameCallback) {
        pendingFrameCallback.video.cancelVideoFrameCallback?.(pendingFrameCallback.handle);
        pausedSeekFlushFrameCallbackRef.current = null;
      }

      const restore = pausedSeekFlushRestoreRef.current;
      const video = currentVideoRef.current;
      if (restore && video) {
        video.muted = restore.muted;
        video.volume = restore.volume;
        video.playbackRate = restore.playbackRate;
        if (wasFlushing && !options?.keepPlayback && !video.paused) {
          video.pause();
        }
      }

      pausedSeekFlushRestoreRef.current = null;
      isPausedSeekFlushRef.current = false;
    },
    [currentVideoRef]
  );

  const schedulePausedSeekFrameFlush = useCallback(
    (video: HTMLVideoElement, targetTime: number) => {
      if (!shouldFlushPausedSeekFrame() || video.readyState < 1) return;

      cancelPausedSeekFrameFlush();
      if (!video.paused) return;

      const token = pausedSeekFlushTokenRef.current + 1;
      pausedSeekFlushTokenRef.current = token;
      let presentedFrameArrived = false;

      const frameCallbackApi = getVideoFrameCallbackApi(video);
      if (frameCallbackApi) {
        const handle = frameCallbackApi.requestVideoFrameCallback((_now, metadata) => {
          if (pausedSeekFlushTokenRef.current !== token) return;
          const mediaTime = metadata.mediaTime;
          if (!Number.isFinite(mediaTime) || Math.abs(mediaTime - targetTime) <= 0.25) {
            presentedFrameArrived = true;
            if (pausedSeekFlushTimerRef.current) {
              clearTimeout(pausedSeekFlushTimerRef.current);
              pausedSeekFlushTimerRef.current = null;
            }
            pausedSeekFlushFrameCallbackRef.current = null;
          }
        });
        pausedSeekFlushFrameCallbackRef.current = { video: frameCallbackApi, handle };
      }

      const restorePlaybackState = () => {
        const restore = pausedSeekFlushRestoreRef.current;
        if (restore) {
          video.muted = restore.muted;
          video.volume = restore.volume;
          video.playbackRate = restore.playbackRate;
        }
        pausedSeekFlushRestoreRef.current = null;
        isPausedSeekFlushRef.current = false;
      };

      const finishFlush = () => {
        if (pausedSeekFlushTokenRef.current !== token) return;
        if (currentVideoRef.current !== video) {
          restorePlaybackState();
          return;
        }

        video.pause();
        restorePlaybackState();
        onFlushComplete(video, targetTime);
      };

      const finishAfterAnimationFrames = (remainingFrames: number) => {
        pausedSeekFlushRafRef.current = requestAnimationFrame(() => {
          if (pausedSeekFlushTokenRef.current !== token) {
            pausedSeekFlushRafRef.current = null;
            return;
          }
          if (remainingFrames <= 1) {
            pausedSeekFlushRafRef.current = null;
            finishFlush();
            return;
          }
          finishAfterAnimationFrames(remainingFrames - 1);
        });
      };

      pausedSeekFlushTimerRef.current = setTimeout(() => {
        pausedSeekFlushTimerRef.current = null;
        const pendingFrameCallback = pausedSeekFlushFrameCallbackRef.current;
        if (pendingFrameCallback) {
          pendingFrameCallback.video.cancelVideoFrameCallback?.(pendingFrameCallback.handle);
          pausedSeekFlushFrameCallbackRef.current = null;
        }

        if (
          presentedFrameArrived ||
          pausedSeekFlushTokenRef.current !== token ||
          currentVideoRef.current !== video ||
          !video.paused
        ) {
          return;
        }

        pausedSeekFlushRestoreRef.current = {
          muted: video.muted,
          volume: video.volume,
          playbackRate: video.playbackRate,
        };
        isPausedSeekFlushRef.current = true;
        video.muted = true;
        video.playbackRate = 1;

        try {
          const playPromise = video.play();
          finishAfterAnimationFrames(WEBKIT_PAUSED_SEEK_FLUSH_RAF_COUNT);
          void playPromise.catch(() => {
            if (pausedSeekFlushTokenRef.current === token) {
              restorePlaybackState();
            }
          });
        } catch {
          if (pausedSeekFlushTokenRef.current === token) {
            restorePlaybackState();
          }
        }
      }, WEBKIT_PAUSED_SEEK_FLUSH_DELAY_MS);
    },
    [cancelPausedSeekFrameFlush, currentVideoRef, onFlushComplete]
  );

  const getPausedSeekFrameFlushRestore = useCallback(() => pausedSeekFlushRestoreRef.current, []);

  const isPausedSeekFrameFlushActive = useCallback(() => isPausedSeekFlushRef.current, []);

  return {
    cancelPausedSeekFrameFlush,
    getPausedSeekFrameFlushRestore,
    isPausedSeekFrameFlushActive,
    schedulePausedSeekFrameFlush,
  };
}
