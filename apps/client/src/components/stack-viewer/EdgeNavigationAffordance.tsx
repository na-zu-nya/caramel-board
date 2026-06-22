import { useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type EdgeAffordanceKind = 'hard' | 'stack-boundary' | null;

type VisibleEdgeKind = Exclude<EdgeAffordanceKind, null>;

interface EdgeNavigationAffordanceProps {
  leftKind: EdgeAffordanceKind;
  rightKind: EdgeAffordanceKind;
  active: boolean;
  resetKey: string;
  attentionSide?: 'left' | 'right' | null;
  attentionToken?: number;
  hidden?: boolean;
  onEntered?: () => void;
}

const EDGE_OFFSET_PX = 18;
const EDGE_ENTER_DELAY_MS = 100;
const EDGE_ENTER_DURATION_MS = 300;
const EDGE_EXIT_DURATION_MS = 180;
const EDGE_ATTENTION_DURATION_MS = 140;
const EDGE_DEFAULT_OPACITY = 0.62;
const EDGE_ATTENTION_OPACITY = 0.22;

const getEdgeLabel = (kind: VisibleEdgeKind) =>
  kind === 'stack-boundary' ? '別のスタックへ移動する境界' : 'ページの端';

const getEdgeColor = (kind: VisibleEdgeKind | null) =>
  kind === 'stack-boundary' ? 'rgba(156, 163, 175, 0.7)' : 'rgba(255, 255, 255, 0.35)';

function EdgeHandle({
  side,
  kind,
  entered,
  attention,
}: {
  side: 'left' | 'right';
  kind: EdgeAffordanceKind;
  entered: boolean;
  attention: boolean;
}) {
  const visible = Boolean(kind && entered);
  const outwardOffset = side === 'left' ? -EDGE_OFFSET_PX : EDGE_OFFSET_PX;

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-0 bottom-0 z-40 flex w-12 items-center',
        side === 'left' ? 'left-0 justify-start' : 'right-0 justify-end'
      )}
      aria-hidden={!kind}
      aria-label={kind ? getEdgeLabel(kind) : undefined}
    >
      <div
        className="h-full w-3 will-change-[transform,opacity]"
        style={{
          opacity: visible ? (attention ? EDGE_ATTENTION_OPACITY : EDGE_DEFAULT_OPACITY) : 0,
          transform: `translate3d(${visible ? 0 : outwardOffset}px, 0, 0)`,
          backgroundColor: getEdgeColor(kind),
          transitionProperty: 'opacity, transform, background-color',
          transitionDuration: visible
            ? `${EDGE_ENTER_DURATION_MS}ms`
            : `${EDGE_EXIT_DURATION_MS}ms`,
          transitionTimingFunction: visible ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'ease-out',
          transitionDelay: visible && !attention ? `${EDGE_ENTER_DELAY_MS}ms` : '0ms',
        }}
      />
    </div>
  );
}

export default function EdgeNavigationAffordance({
  leftKind,
  rightKind,
  active,
  resetKey,
  attentionSide = null,
  attentionToken = 0,
  hidden = false,
  onEntered,
}: EdgeNavigationAffordanceProps) {
  const hasVisibleEdge = Boolean(leftKind || rightKind);
  const shouldEnter = active && !hidden && hasVisibleEdge;
  const visibleKey = shouldEnter
    ? `${resetKey}:${leftKind ?? 'none'}:${rightKind ?? 'none'}`
    : `hidden:${resetKey}`;
  const [entered, setEntered] = useState(false);
  const [activeAttentionSide, setActiveAttentionSide] = useState<'left' | 'right' | null>(null);

  useLayoutEffect(() => {
    void visibleKey;

    if (!shouldEnter) {
      setEntered(false);
      return;
    }

    setEntered(false);
    const frameId = requestAnimationFrame(() => {
      setEntered(true);
    });
    const readyTimerId = setTimeout(() => {
      onEntered?.();
    }, EDGE_ENTER_DELAY_MS + EDGE_ENTER_DURATION_MS);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(readyTimerId);
    };
  }, [onEntered, shouldEnter, visibleKey]);

  useLayoutEffect(() => {
    if (!shouldEnter || !attentionSide || attentionToken <= 0) return;

    setEntered(true);
    setActiveAttentionSide(attentionSide);
    const clearAttentionTimerId = setTimeout(() => {
      setActiveAttentionSide(null);
    }, EDGE_ATTENTION_DURATION_MS);
    const readyTimerId = setTimeout(() => {
      onEntered?.();
    }, EDGE_ATTENTION_DURATION_MS);

    return () => {
      clearTimeout(clearAttentionTimerId);
      clearTimeout(readyTimerId);
    };
  }, [attentionSide, attentionToken, onEntered, shouldEnter]);

  if (hidden) return null;

  return (
    <>
      <EdgeHandle
        side="left"
        kind={leftKind}
        entered={entered}
        attention={activeAttentionSide === 'left'}
      />
      <EdgeHandle
        side="right"
        kind={rightKind}
        entered={entered}
        attention={activeAttentionSide === 'right'}
      />
    </>
  );
}
