import { useEffect, useMemo, useRef, useState } from 'react';

export function useAnimationState(trigger: unknown, duration = 300) {
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimeoutRef = useRef<number | null>(null);
  const prevTriggerRef = useRef<unknown>(JSON.stringify(trigger));

  // triggerを文字列化して値の変化を検出
  const triggerKey = useMemo(() => {
    return JSON.stringify(trigger);
  }, [trigger]);

  useEffect(() => {
    // 実際に値が変わった場合のみアニメーションを開始
    if (prevTriggerRef.current !== triggerKey) {
      prevTriggerRef.current = triggerKey;
      setIsAnimating(true);

      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      animationTimeoutRef.current = window.setTimeout(() => {
        setIsAnimating(false);
      }, duration);
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [triggerKey, duration]);

  return isAnimating || prevTriggerRef.current !== triggerKey;
}

export function useScrollSuppression(isSidebarAnimating: boolean, isRightPanelAnimating: boolean) {
  const shouldSuppressScroll = isSidebarAnimating || isRightPanelAnimating;

  return { shouldSuppressScroll };
}
