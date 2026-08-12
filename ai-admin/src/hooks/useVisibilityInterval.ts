import { useEffect, useRef } from 'react';

/**
 * Custom hook that runs a polling callback at `delayMs` intervals,
 * but automatically pauses execution when the browser tab is hidden/inactive.
 * When the tab becomes visible again, it immediately triggers the callback once and resumes polling.
 */
export function useVisibilityInterval(
  callback: () => void | Promise<void>,
  delayMs: number | null
) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null || delayMs <= 0) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && !document.hidden) {
          savedCallback.current();
        }
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        // Tab became visible — refresh immediately and restart interval
        savedCallback.current();
        startInterval();
      } else if (intervalId) {
        // Tab hidden — clear timer to save network and Redis quota
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Initial start if visible
    if (typeof document !== 'undefined' && !document.hidden) {
      startInterval();
    }

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [delayMs]);
}
