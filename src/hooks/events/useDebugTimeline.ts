import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { ProjectEventUnion } from '@/contexts/project-events/dto';
import { Span } from '@/types/common-type';
import { buildSpanHierarchy } from '@/utils/span-hierarchy';
import { processEvent } from './utilities';

export interface UseDebugTimelineProps {
  projectId: string;
  flattenSpans: Span[];
  setFlattenSpans: React.Dispatch<React.SetStateAction<Span[]>>;
}

export function useDebugTimeline({
  projectId,
  flattenSpans,
  setFlattenSpans
}: UseDebugTimelineProps) {
  const { subscribe } = ProjectEventsConsumer();
  const [isPaused, setIsPaused] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>(undefined);
  const pausedEventsRef = useRef<ProjectEventUnion[]>([]);

  /**
   * Process events to build span hierarchy in real-time
   * Uses pure processEvent function from utilities for testability
   */
  const handleEvent = useCallback((event: ProjectEventUnion) => {
    // Note: In development with React StrictMode, effects run twice
    // This is intentional React behavior and won't happen in production
    setFlattenSpans((currentSpans) => processEvent(currentSpans, event));
  }, []);

  // Subscribe to all project events
  useEffect(() => {
    const unsubscribe = subscribe('debug-timeline-events', (event: ProjectEventUnion) => {
      if (isPaused) {
        pausedEventsRef.current.push(event);
      } else {
        handleEvent(event);
      }
    });

    return unsubscribe;
  }, [subscribe, projectId, handleEvent, isPaused]);

  // Resume and process paused events
  const resume = useCallback(() => {
    setIsPaused(false);
    if (pausedEventsRef.current.length > 0) {
      pausedEventsRef.current.forEach(handleEvent);
      pausedEventsRef.current = [];
    }
  }, [handleEvent]);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const clear = useCallback(() => {
    setFlattenSpans([]);
    pausedEventsRef.current = [];
    setSelectedSpanId(undefined);
  }, []);

  // Memoized selected span
  const selectedSpan = useMemo(() => {
    if (!selectedSpanId) return null;
    return flattenSpans.find(span => span.span_id === selectedSpanId) || null;
  }, [selectedSpanId, flattenSpans]);

  // Build hierarchy from flat spans
  const spanHierarchies: Span[] = useMemo(
    () => buildSpanHierarchy(flattenSpans),
    [flattenSpans]
  );

  // Group spans by thread
  const spansByThread = useMemo(() => {
    const grouped = new Map<string, Span[]>();
    flattenSpans.forEach(span => {
      if (span.thread_id) {
        const existing = grouped.get(span.thread_id) || [];
        grouped.set(span.thread_id, [...existing, span]);
      }
    });
    return grouped;
  }, [flattenSpans]);


  const pausedCount = pausedEventsRef.current.length;

  return {
    spanHierarchies,
    spansByThread,
    isPaused,
    pausedCount,
    pause,
    resume,
    clear,
    selectedSpan,
    setSelectedSpanId,
    selectedSpanId
  };
}
