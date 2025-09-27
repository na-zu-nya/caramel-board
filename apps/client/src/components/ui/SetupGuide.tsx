import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  content?: React.ReactNode;
  illustration?: React.ReactNode;
}

export interface SetupGuideProps {
  steps: SetupStep[];
  activeIndex: number;
  onRequestPrev?: () => void;
  onRequestNext?: () => void;
  onStepSelect?: (index: number) => void;
  className?: string;
}

export function SetupGuide({
  steps,
  activeIndex,
  onRequestPrev,
  onRequestNext,
  onStepSelect,
  className,
}: SetupGuideProps) {
  const activeStep = steps[activeIndex];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === steps.length - 1;

  return (
    <div className={cn('relative', className)}>
      {/* Progress Indicator */}
      <div className="mb-12">
        {/* Step Indicators */}
        <div className="relative">
          {/* Progress Line */}
          <div className="absolute left-0 top-5 h-[2px] w-full bg-gray-200">
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{
                backgroundColor: '#C7743C',
                width: `${(activeIndex / (steps.length - 1)) * 100}%`,
              }}
            />
          </div>

          {/* Step Dots */}
          <div className="relative flex justify-between">
            {steps.map((step, index) => {
              const isActive = index === activeIndex;
              const isCompleted = index < activeIndex;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onStepSelect?.(index)}
                  className={cn(
                    'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white transition-all duration-300',
                    isActive
                      ? 'shadow-lg'
                      : isCompleted
                        ? ''
                        : 'border-gray-300 hover:border-gray-400',
                    'focus:outline-none focus:ring-4'
                  )}
                  style={{
                    borderColor: isActive || isCompleted ? '#C7743C' : undefined,
                    backgroundColor: isCompleted ? '#C7743C' : undefined,
                    boxShadow: isActive ? '0 10px 15px -3px rgba(199, 116, 60, 0.25)' : undefined,
                  }}
                  aria-label={`Step ${index + 1}: ${step.title}`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-white" />
                  ) : (
                    <span
                      className={cn('text-sm font-medium', isActive ? '' : 'text-gray-500')}
                      style={isActive ? { color: '#C7743C' } : {}}
                    >
                      {index + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Step Labels */}
          <div className="mt-4 flex justify-between">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  'max-w-[120px] text-center text-xs',
                  index === activeIndex ? 'text-gray-900 font-medium' : 'text-gray-500'
                )}
              >
                {step.title}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="mx-auto max-w-2xl">
          {/* Title and Description */}
          <div className="mb-8 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-gray-900">
              {activeStep.title}
            </h2>
            <p className="text-lg text-gray-600">{activeStep.description}</p>
          </div>

          {/* Illustration */}
          {activeStep.illustration && <div className="mb-8">{activeStep.illustration}</div>}

          {/* Content */}
          {activeStep.content && (
            <div className="mb-8 rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
              {activeStep.content}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="lg"
              onClick={onRequestPrev}
              disabled={isFirst}
              className={cn(
                'transition-all duration-200',
                isFirst ? 'invisible' : 'visible hover:shadow-md'
              )}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              前へ
            </Button>

            <Button
              variant="default"
              size="lg"
              onClick={onRequestNext}
              disabled={isLast}
              className={cn(
                'text-white shadow-lg hover:shadow-xl transition-all duration-200',
                isLast ? 'invisible' : 'visible'
              )}
              style={{
                backgroundColor: '#C7743C',
              }}
            >
              次へ
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
