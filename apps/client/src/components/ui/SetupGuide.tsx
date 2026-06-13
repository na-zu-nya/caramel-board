import { ChevronLeft, ChevronRight } from 'lucide-react';
import type React from 'react';
import { cn } from '@/lib/utils';

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  content?: React.ReactNode;
  illustration?: React.ReactNode;
  /** 次へボタンを無効化する(条件未達など) */
  nextDisabled?: boolean;
  /** 次へボタンのラベルを差し替える */
  nextLabel?: string;
  /** 次へボタンを出さない(ステップ内のフォーム送信などで進む場合) */
  hideNext?: boolean;
  /** スキップリンクを表示する場合のラベル */
  skipLabel?: string;
  /** スキップリンク押下時の処理 */
  onSkip?: () => void;
}

export interface SetupGuideProps {
  steps: SetupStep[];
  activeIndex: number;
  onRequestPrev?: () => void;
  onRequestNext?: () => void;
  onStepSelect?: (index: number) => void;
  /** ドットでジャンプできる最大インデックス(未指定なら制限なし) */
  maxSelectableIndex?: number;
  className?: string;
}

export function SetupGuide({
  steps,
  activeIndex,
  onRequestPrev,
  onRequestNext,
  onStepSelect,
  maxSelectableIndex,
  className,
}: SetupGuideProps) {
  const activeStep = steps[activeIndex];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === steps.length - 1;

  return (
    <div className={cn('relative', className)}>
      {/* キャンディ型プログレス */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            const isCompleted = index < activeIndex;
            const selectable = maxSelectableIndex === undefined || index <= maxSelectableIndex;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (!selectable) return;
                  onStepSelect?.(index);
                }}
                className={cn(
                  'h-3 rounded-full transition-all duration-300',
                  isActive
                    ? 'w-10 bg-[#C7743C] shadow-[0_2px_10px_rgba(199,116,60,0.45)]'
                    : isCompleted
                      ? 'w-3 bg-[#C7743C]/60 hover:scale-125'
                      : 'w-3 bg-[#EAD9C5]',
                  selectable && !isActive ? 'cursor-pointer hover:bg-[#DBBE9E]' : '',
                  !selectable ? 'cursor-default' : ''
                )}
                aria-label={`Step ${index + 1}: ${step.title}`}
              />
            );
          })}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C08A5C]">
          Step {activeIndex + 1} / {steps.length}
        </span>
      </div>

      {/* コンテンツ */}
      <div key={activeStep.id} className="setup-pop-in mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-[#46301D]">
            {activeStep.title}
          </h2>
          <p className="text-base leading-relaxed text-[#8A6A4F]">{activeStep.description}</p>
        </div>

        {activeStep.illustration && <div className="mb-8">{activeStep.illustration}</div>}

        {activeStep.content && (
          <div className="relative mb-8 rounded-3xl border border-[#F0DFC8] bg-white/90 p-8 shadow-[0_24px_60px_-24px_rgba(199,116,60,0.35)] backdrop-blur-sm">
            {/* マスキングテープ */}
            <span className="pointer-events-none absolute -top-3 left-1/2 h-6 w-28 -translate-x-1/2 -rotate-3 rounded-sm bg-[#E8B48C]/60" />
            {activeStep.content}
          </div>
        )}

        {/* ナビゲーション */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onRequestPrev}
            disabled={isFirst}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border border-[#EAD9C5] bg-white/70 px-5 py-2.5 text-sm font-semibold text-[#8A6A4F] transition-all hover:bg-[#FFF3E6] hover:shadow-md',
              isFirst ? 'invisible' : 'visible'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            前へ
          </button>

          {activeStep.skipLabel ? (
            <button
              type="button"
              className="text-sm text-[#A78B70] underline-offset-4 hover:text-[#8A6A4F] hover:underline"
              onClick={activeStep.onSkip}
            >
              {activeStep.skipLabel}
            </button>
          ) : null}

          {isLast || activeStep.hideNext ? (
            // レイアウト維持用のプレースホルダ(条件達成で次へボタンがアニメーション出現する)
            <span className="min-w-[96px]" aria-hidden />
          ) : (
            <button
              type="button"
              onClick={onRequestNext}
              disabled={activeStep.nextDisabled}
              className="setup-pop-in inline-flex items-center gap-1 rounded-lg bg-[#C7743C] px-6 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_-10px_rgba(199,116,60,0.7)] transition-all hover:-translate-y-0.5 hover:bg-[#B36430] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {activeStep.nextLabel ?? '次へ'}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
