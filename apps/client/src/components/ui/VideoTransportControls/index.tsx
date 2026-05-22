import { FastForward, Play, Rewind, StepBack, StepForward } from 'lucide-react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface VideoTransportControlsProps {
  className?: string;
  hidden?: boolean;
  onPlay: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onShuttleStart: (direction: -1 | 1) => void;
  onShuttleEnd: () => void;
}

interface HoldButtonProps {
  id: ControlId;
  label: string;
  direction: -1 | 1;
  className?: string;
  activeControl: ControlId | null;
  onActivate: (id: ControlId) => void;
  onDeactivate: (id: ControlId) => void;
  onShuttleStart: (direction: -1 | 1) => void;
  onShuttleEnd: () => void;
  children: ReactNode;
}

type ControlId = 'rewind' | 'step-backward' | 'play' | 'step-forward' | 'fast-forward';

const baseButtonClassName =
  'relative flex h-10 w-11 items-center justify-center rounded-xl text-white/95 transition-colors duration-150 hover:bg-white/10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 [&_svg]:transition-all [&_svg]:duration-300 [&_svg]:ease-out';

const activeButtonClassName =
  'bg-white/15 [&_svg]:[filter:drop-shadow(0_0_8px_rgba(255,255,255,0.95))]';

function HoldButton({
  id,
  label,
  direction,
  className,
  activeControl,
  onActivate,
  onDeactivate,
  onShuttleStart,
  onShuttleEnd,
  children,
}: HoldButtonProps) {
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      onActivate(id);
      onShuttleStart(direction);
    },
    [direction, id, onActivate, onShuttleStart]
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onShuttleEnd();
      onDeactivate(id);
    },
    [id, onDeactivate, onShuttleEnd]
  );

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleLostPointerCapture = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onShuttleEnd();
      onDeactivate(id);
    },
    [id, onDeactivate, onShuttleEnd]
  );

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(baseButtonClassName, className, activeControl === id && activeButtonClassName)}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handleLostPointerCapture}
    >
      {children}
    </button>
  );
}

export function VideoTransportControls({
  className,
  hidden = false,
  onPlay,
  onStepBackward,
  onStepForward,
  onShuttleStart,
  onShuttleEnd,
}: VideoTransportControlsProps) {
  const [activeControl, setActiveControl] = useState<ControlId | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activateControl = useCallback((id: ControlId) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setActiveControl(id);
  }, []);

  const deactivateControl = useCallback((id: ControlId) => {
    setActiveControl((current) => (current === id ? null : current));
  }, []);

  const flashControl = useCallback((id: ControlId) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
    }
    setActiveControl(id);
    flashTimerRef.current = setTimeout(() => {
      setActiveControl((current) => (current === id ? null : current));
      flashTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hidden) {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      setActiveControl(null);
    }
  }, [hidden]);

  const handleControlClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleStepBackward = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      flashControl('step-backward');
      onStepBackward();
    },
    [flashControl, onStepBackward]
  );

  const handleStepForward = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      flashControl('step-forward');
      onStepForward();
    },
    [flashControl, onStepForward]
  );

  const handlePlay = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      flashControl('play');
      onPlay();
    },
    [flashControl, onPlay]
  );

  const handleControlPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-2xl border border-white/15 bg-black/55 p-1 shadow-xl shadow-black/40 backdrop-blur-md transition-opacity duration-300 ease-out',
        hidden && 'pointer-events-none opacity-0',
        className
      )}
      onClick={handleControlClick}
      onPointerDown={handleControlPointerDown}
      style={{ touchAction: 'none' }}
    >
      <HoldButton
        id="rewind"
        label="1.5x rewind while holding"
        direction={-1}
        activeControl={activeControl}
        onActivate={activateControl}
        onDeactivate={deactivateControl}
        onShuttleStart={onShuttleStart}
        onShuttleEnd={onShuttleEnd}
      >
        <Rewind className="h-5 w-5" aria-hidden />
      </HoldButton>
      <button
        type="button"
        aria-label="Step backward one frame"
        title="Step backward one frame"
        className={cn(
          baseButtonClassName,
          activeControl === 'step-backward' && activeButtonClassName
        )}
        onClick={handleStepBackward}
      >
        <StepBack className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Play"
        title="Play"
        className={cn(
          baseButtonClassName,
          'w-12',
          activeControl === 'play' && activeButtonClassName
        )}
        onClick={handlePlay}
      >
        <Play className="h-5 w-5 fill-current" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Step forward one frame"
        title="Step forward one frame"
        className={cn(
          baseButtonClassName,
          activeControl === 'step-forward' && activeButtonClassName
        )}
        onClick={handleStepForward}
      >
        <StepForward className="h-5 w-5" aria-hidden />
      </button>
      <HoldButton
        id="fast-forward"
        label="1.5x fast forward while holding"
        direction={1}
        activeControl={activeControl}
        onActivate={activateControl}
        onDeactivate={deactivateControl}
        onShuttleStart={onShuttleStart}
        onShuttleEnd={onShuttleEnd}
      >
        <FastForward className="h-5 w-5" aria-hidden />
      </HoldButton>
    </div>
  );
}
