import { useCallback, useEffect, useRef } from 'react';

/**
 * Creates a throttled version of a function
 * @param fn - The function to throttle
 * @param delay - The delay in milliseconds
 * @returns A throttled version of the function
 */
export function useThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const throttledFn = useCallback(
    (...args: Args) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        // Execute immediately if enough time has passed
        fnRef.current(...args);
        lastRunRef.current = now;
      } else {
        // Schedule execution for later
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        const remainingTime = delay - timeSinceLastRun;
        timeoutRef.current = window.setTimeout(() => {
          fnRef.current(...args);
          lastRunRef.current = Date.now();
          timeoutRef.current = null;
        }, remainingTime);
      }
    },
    [delay]
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
export function useThrottleWithOptions<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
  options: {
    leading?: boolean;
    trailing?: boolean;
  } = {}
): (...args: Args) => void {
  const { leading = true, trailing = true } = options;
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const lastArgsRef = useRef<Args | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const throttledFn = useCallback(
    (...args: Args) => {
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
          fnRef.current(...args);
          lastRunRef.current = now;
        }
      }

      if (trailing && timeSinceLastRun < delay) {
        // Schedule trailing execution
        const remainingTime = delay - timeSinceLastRun;
        timeoutRef.current = window.setTimeout(() => {
          if (lastArgsRef.current) {
            fnRef.current(...lastArgsRef.current);
            lastRunRef.current = Date.now();
            lastArgsRef.current = null;
          }
          timeoutRef.current = null;
        }, remainingTime);
      }
    },
    [delay, leading, trailing]
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
