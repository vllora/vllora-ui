import { useEffect, useState, useCallback, useRef } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { ProjectEventUnion } from '@/contexts/project-events/dto';

export interface DebugEvent {
  // Include all fields from the original event
  event: ProjectEventUnion;
  // Add a client-side timestamp for when we received the event
  receivedAt: number;
}

export interface UseDebugEventsProps {
  projectId: string;
  maxEvents?: number; // Limit stored events to prevent memory issues
}

export function useDebugEvents({ projectId, maxEvents = 1000 }: UseDebugEventsProps) {
  const { subscribe } = ProjectEventsConsumer();
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const pausedEventsRef = useRef<DebugEvent[]>([]);

  // Add event to the list
  const addEvent = useCallback((event: ProjectEventUnion) => {
    const debugEvent: DebugEvent = {
      event,
      receivedAt: Date.now(),
    };

    setEvents((prev) => {
      // Add to the beginning (most recent first)
      const newEvents = [debugEvent, ...prev];
      // Limit the number of stored events
      return newEvents.slice(0, maxEvents);
    });
  }, [maxEvents]);

  // Subscribe to all project events
  useEffect(() => {
    const unsubscribe = subscribe(
      'debug-page-events',
      (event: ProjectEventUnion) => {
        if (isPaused) {
          // Store events while paused
          pausedEventsRef.current.push({
            event,
            receivedAt: Date.now(),
          });
        } else {
          addEvent(event);
        }
      }
    );

    return unsubscribe;
  }, [subscribe, projectId, addEvent, isPaused]);

  // Resume and flush paused events
  const resume = useCallback(() => {
    setIsPaused(false);
    if (pausedEventsRef.current.length > 0) {
      setEvents((prev) => {
        const combined = [...pausedEventsRef.current.reverse(), ...prev];
        pausedEventsRef.current = [];
        return combined.slice(0, maxEvents);
      });
    }
  }, [maxEvents]);

  // Pause event collection
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  // Clear all events
  const clear = useCallback(() => {
    setEvents([]);
    pausedEventsRef.current = [];
  }, []);

  // Get count of paused events
  const pausedCount = pausedEventsRef.current.length;

  return {
    events,
    isPaused,
    pausedCount,
    pause,
    resume,
    clear,
  };
}
