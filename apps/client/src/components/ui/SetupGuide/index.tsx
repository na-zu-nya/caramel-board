import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DIRECTION = {
  display: 'right-to-left',
  prev: 'right',
  next: 'left',
} as const;

export interface SetupGuideStep {
  id: string;
  title: string;
  description?: string;
  eyebrow?: string;
  content?: ReactNode;
  illustration?: ReactNode;
}

export interface SetupGuideProps {
  steps: SetupGuideStep[];
  activeIndex: number;
  onRequestPrev?: () => void;
  onRequestNext?: () => void;
  onStepSelect?: (index: number) => void;
  className?: string;
}

const DRAG_THRESHOLD_RATIO = 1 / 3;
const MAX_DRAG_RATIO = 0.45;

export function SetupGuide({
  steps,
  activeIndex,
  onRequestPrev,
  onRequestNext,
  onStepSelect,
  className,
}: SetupGuideProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const totalSteps = steps.length;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < totalSteps - 1;

  useEffect(() => {
    setDragOffset(0);
    dragStartXRef.current = null;
    dragDeltaRef.current = 0;
  }, [activeIndex]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    dragStartXRef.current = event.clientX;
    dragDeltaRef.current = 0;
    setIsDragging(true);
    container.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const startX = dragStartXRef.current;
    if (startX === null) return;

    const container = containerRef.current;
    if (!container) return;

    const delta = event.clientX - startX;
    const maxOffset = container.offsetWidth * MAX_DRAG_RATIO;
    const clamped = Math.max(Math.min(delta, maxOffset), -maxOffset);

    dragDeltaRef.current = clamped;
    setDragOffset(clamped);
    event.preventDefault();
  };

  const bounceToCenter = () => {
    setDragOffset(0);
  };

  const navigateToPrev = () => {
    if (!hasPrev) {
      bounceToCenter();
      return;
    }
    onRequestPrev?.();
  };

  const navigateToNext = () => {
    if (!hasNext) {
      bounceToCenter();
      return;
    }
    onRequestNext?.();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const container = containerRef.current;
    const startX = dragStartXRef.current;
    const delta = dragDeltaRef.current;

    setIsDragging(false);
    container?.releasePointerCapture?.(event.pointerId);
    dragStartXRef.current = null;
    dragDeltaRef.current = 0;

    if (!container || startX === null) {
      bounceToCenter();
      return;
    }

    const distance = Math.abs(delta);
    const threshold = container.offsetWidth * DRAG_THRESHOLD_RATIO;

    if (distance < threshold || (!hasPrev && delta < 0) || (!hasNext && delta > 0)) {
      bounceToCenter();
      return;
    }

    if (delta < 0) {
      // 左へドラッグ = 前へ
      navigateToPrev();
    } else {
      navigateToNext();
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (isDragging) return;
    if (event.target instanceof Element && event.currentTarget !== event.target) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - rect.left;

    if (tapX < rect.width / 2) {
      navigateToNext();
    } else {
      navigateToPrev();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigateToNext();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigateToPrev();
    }
  };

  const currentStep = steps[activeIndex];

  const trackStyle = useMemo(() => {
    const offsetPercent = `-${activeIndex * 100}%`;
    return {
      transform: `translateX(calc(${offsetPercent} + ${dragOffset}px))`,
      direction: DIRECTION.display === 'right-to-left' ? 'rtl' : 'ltr',
    } satisfies CSSProperties;
  }, [activeIndex, dragOffset]);

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-500">
            ステップ {activeIndex + 1} / {totalSteps}
          </span>
          <h2 className="text-3xl font-semibold text-gray-900">{currentStep?.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={navigateToNext}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
            disabled={!hasNext}
          >
            次へ
          </button>
          <button
            type="button"
            onClick={navigateToPrev}
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-100 disabled:text-gray-400"
            disabled={!hasPrev}
          >
            戻る
          </button>
        </div>
      </div>

      {currentStep?.description && (
        <p className="text-base text-muted-foreground">{currentStep.description}</p>
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_12px_48px_rgba(15,23,42,0.08)] focus:outline-none',
          'transition-shadow duration-200 ease-out focus:ring-2 focus:ring-amber-400 focus:ring-offset-2'
        )}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="ライブラリセットアップガイド"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div
          ref={trackRef}
          className={cn(
            'flex w-full',
            isDragging ? 'transition-none' : 'transition-transform duration-300 ease-out'
          )}
          style={trackStyle}
        >
          {steps.map((step) => (
            <section
              key={step.id}
              className="w-full shrink-0 px-10 py-12 flex flex-col gap-6"
              aria-label={step.title}
            >
              {step.eyebrow && (
                <span className="text-sm font-medium uppercase tracking-widest text-amber-500">
                  {step.eyebrow}
                </span>
              )}
              <div className="space-y-4">
                <h3 className="text-2xl font-semibold text-gray-900">{step.title}</h3>
                {step.description && (
                  <p className="text-base text-muted-foreground">{step.description}</p>
                )}
              </div>
              {step.illustration && (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6">
                  {step.illustration}
                </div>
              )}
              {step.content && <div className="space-y-4">{step.content}</div>}
            </section>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepSelect?.(index)}
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-colors',
                index === activeIndex ? 'bg-gray-900' : 'bg-gray-300 hover:bg-gray-400'
              )}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          左へスワイプで前のステップ、右へスワイプで次のステップに進みます
        </span>
      </div>
    </div>
  );
}

export default SetupGuide;
