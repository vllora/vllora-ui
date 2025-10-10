import { useState, useEffect, useRef } from 'react';
import { differenceInSeconds } from 'date-fns';

// Map of intervals by frequency (in ms) -> { intervalId, listeners }
const intervalGroups = new Map<number, {
  intervalId: ReturnType<typeof setInterval>;
  listeners: Set<() => void>;
}>();

const startSharedInterval = (intervalAmount: number, listener: () => void) => {
  let group = intervalGroups.get(intervalAmount);
  if (!group) {
    // Create new interval group for this frequency
    const listeners = new Set<() => void>();
    listeners.add(listener);

    const intervalId = setInterval(() => {
      listeners.forEach(fn => fn());
    }, intervalAmount);
    intervalGroups.set(intervalAmount, { intervalId, listeners });
  } else {
    // Add to existing group
    group.listeners.add(listener);
  }
};

const stopSharedInterval = (intervalAmount: number, listener: () => void) => {
  const group = intervalGroups.get(intervalAmount);
  if (!group) return;

  group.listeners.delete(listener);

  // If no more listeners for this frequency, clear the interval
  if (group.listeners.size === 0) {
    clearInterval(group.intervalId);
    intervalGroups.delete(intervalAmount);
  }
};

/**
 * Hook to update relative time display only for messages less than 60 seconds old
 * Automatically stops updating once message is older than 60 seconds
 */
export const useRelativeTime = (
  elementRef: React.RefObject<HTMLElement | null>,
  timestamp?: string, //ISO format with Z,
  intervalAmountInMs: number = 5000, // 5000ms = 5s
  stopTimeInSecond: number = 60 // 60 seconds
) => {
  const [, forceUpdate] = useState({});
  const isVisibleRef = useRef(false);
  const isActiveRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !timestamp) return;

    const updateTime = () => {
      // Check if timestamp is still within stopTimeInSecond
      const date = new Date(timestamp);
      const secondsAgo = differenceInSeconds(new Date(), date);
      if (secondsAgo < stopTimeInSecond) {
        forceUpdate({});
      } else {
        // Stop updating once older than stopTimeInSecond
        if (isActiveRef.current) {
          isActiveRef.current = false;
          stopSharedInterval(intervalAmountInMs, updateTime);
        }
      }
    };

    // Check if timestamp is recent enough to need updates
    const date = new Date(timestamp);
    const secondsAgo = differenceInSeconds(new Date(), date);

    // Only set up observer if message is less than stopTimeInSecond old
    if (secondsAgo >= stopTimeInSecond) {
      return; // Don't update, already showing fixed time
    }

    // Only update time when element is visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!isVisibleRef.current) {
              isVisibleRef.current = true;
              isActiveRef.current = true;
              startSharedInterval(intervalAmountInMs, updateTime);
            }
          } else {
            if (isVisibleRef.current) {
              isVisibleRef.current = false;
              isActiveRef.current = false;
              stopSharedInterval(intervalAmountInMs, updateTime);
            }
          }
        });
      },
      { rootMargin: '100px' }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      stopSharedInterval(intervalAmountInMs, updateTime);
    };
  }, [elementRef, timestamp, intervalAmountInMs, stopTimeInSecond]);
};
