import { useCallback, useEffect, useRef } from 'react';

/**
 * Creates a throttled version of a function
 * @param fn - The function to throttle
 * @param delay - The delay in milliseconds
 * @returns A throttled version of the function
 */
export function useThrottle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);

  const throttledFn = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        // Execute immediately if enough time has passed
        fn(...args);
        lastRunRef.current = now;
      } else {
        // Schedule execution for later
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        const remainingTime = delay - timeSinceLastRun;
        timeoutRef.current = window.setTimeout(() => {
          fn(...args);
          lastRunRef.current = Date.now();
        }, remainingTime);
      }
    },
    [fn, delay]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledFn;
}

/**
 * Creates a throttled version of a function with leading and trailing options
 * @param fn - The function to throttle
 * @param delay - The delay in milliseconds
 * @param options - Options for throttling behavior
 * @returns A throttled version of the function
 */
export function useThrottleWithOptions<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  options: {
    leading?: boolean;
    trailing?: boolean;
  } = {}
): (...args: Parameters<T>) => void {
  const { leading = true, trailing = true } = options;
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);

  const throttledFn = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      lastArgsRef.current = args;

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (timeSinceLastRun >= delay) {
        // Execute immediately if enough time has passed
        if (leading) {
          fn(...args);
          lastRunRef.current = now;
        }
      }

      if (trailing && timeSinceLastRun < delay) {
        // Schedule trailing execution
        const remainingTime = delay - timeSinceLastRun;
        timeoutRef.current = window.setTimeout(() => {
          if (lastArgsRef.current) {
            fn(...lastArgsRef.current);
            lastRunRef.current = Date.now();
            lastArgsRef.current = null;
          }
        }, remainingTime);
      }
    },
    [fn, delay, leading, trailing]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledFn;
}
