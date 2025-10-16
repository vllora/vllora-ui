import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import {
  ProjectEventUnion,
  CustomEvent,
} from '@/contexts/project-events/dto';
import { Span } from '@/types/common-type';
import { buildSpanHierarchy } from '@/utils/span-hierarchy';
import {
  convertAgentStartedToSpan,
  convertTaskStartedToSpan,
  convertCustomSpanStartToSpan,
  convertCustomSpanEndToSpan,
  convertRunStartedToSpan,
  convertStepStartedToSpan,
  convertTextMessageStartToSpan,
  convertToolCallStartToSpan,
} from './utilities';

export interface UseDebugTimelineProps {
  projectId: string;
}

export function useDebugTimeline({ projectId }: UseDebugTimelineProps) {
  const { subscribe } = ProjectEventsConsumer();

  // Flat span collection - spans added immediately when started, updated when finished
  const [flattenSpans, setFlattenSpans] = useState<Span[]>([]);

  const [isPaused, setIsPaused] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>(undefined);
  const pausedEventsRef = useRef<ProjectEventUnion[]>([]);

  /**
   * Process events to build span hierarchy in real-time
   *
   * Event Flow:
   * 1. AgentStarted/TaskStarted -> Convert to in-progress span
   * 2. Custom(span_start) -> Convert to in-progress span
   * 3. AgentFinished/TaskFinished -> Update span to completed
   * 4. Custom(span_end) -> Update or add complete span
   *
   * Hierarchy Construction:
   * - Each event has span_id and parent_span_id for building parent-child relationships
   * - Spans are stored in a flat array, hierarchy is computed on-demand via convertToHierarchy
   * - In-progress spans are visible immediately in the UI
   */
  const processEvents = useCallback((event: ProjectEventUnion) => {

    const timestamp = event.timestamp || Date.now();
    console.log('==== processEvents Received event:', event);
    // === Run Lifecycle Events ===

    // Handle RunStarted - Add in-progress span
    if (event.type === 'RunStarted') {
      const span = convertRunStartedToSpan(event);
      setFlattenSpans((prevSpans) => [...prevSpans, span]);
      return;
    }

    // Handle RunFinished/RunError - Update span to completed
    if (event.type === 'RunFinished' || event.type === 'RunError') {
      const spanId = event.span_id || event.run_id;
      if (spanId) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === spanId);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              finish_time_us: timestamp * 1000,
              isInProgress: false,
              ...(event.type === 'RunError' && {
                attribute: {
                  ...updated[existingIndex].attribute,
                  error: event.message,
                  error_code: event.code,
                }
              })
            };
            return updated;
          }
          return prevSpans;
        });
      }
      return;
    }

    // === Agent/Task/Step Lifecycle Events ===

    // Handle AgentStarted - Add in-progress span
    if (event.type === 'AgentStarted') {
      const span = convertAgentStartedToSpan(event);
      setFlattenSpans((prevSpans) => [...prevSpans, span]);
      return;
    }

    // Handle TaskStarted - Add in-progress span
    if (event.type === 'TaskStarted') {
      const span = convertTaskStartedToSpan(event);
      setFlattenSpans((prevSpans) => [...prevSpans, span]);
      return;
    }

    // Handle StepStarted - Add in-progress span
    if (event.type === 'StepStarted') {
      const span = convertStepStartedToSpan(event);
      setFlattenSpans((prevSpans) => [...prevSpans, span]);
      return;
    }

    // Handle AgentFinished/TaskFinished/StepFinished - Update span to completed
    if (event.type === 'AgentFinished' || event.type === 'TaskFinished' || event.type === 'StepFinished') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              finish_time_us: timestamp * 1000,
              isInProgress: false,
            };
            return updated;
          }
          return prevSpans;
        });
      }
      return;
    }

    // === Text Message Events ===

    // Handle TextMessageStart - Add in-progress span
    if (event.type === 'TextMessageStart') {
      const span = convertTextMessageStartToSpan(event);
      setFlattenSpans((prevSpans) => [...prevSpans, span]);
      return;
    }

    // Handle TextMessageContent - Update span with content delta
    if (event.type === 'TextMessageContent') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            const attr = updated[existingIndex].attribute as any;
            const currentContent = attr.content || '';
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                content: currentContent + event.delta,
              } as any,
            };
            return updated;
          } else {
            if (!event.span_id) {
              return prevSpans;
            }
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: event.span_id,
              parent_span_id: event.parent_span_id,
              operation_name: 'text_message',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: { content: event.delta } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // Handle TextMessageEnd - Update span to completed
    if (event.type === 'TextMessageEnd') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              finish_time_us: timestamp * 1000,
              isInProgress: false,
            };
            return updated;
          }
          return prevSpans;
        });
      }
      return;
    }

    // === Tool Call Events ===

    // Handle ToolCallStart - Add in-progress span
    if (event.type === 'ToolCallStart') {
      const span = convertToolCallStartToSpan(event);
      setFlattenSpans((prevSpans) => [...prevSpans, span]);
      return;
    }

    // Handle ToolCallArgs - Update span with arguments delta
    if (event.type === 'ToolCallArgs') {
      const spanId = event.span_id || event.tool_call_id;
      if (spanId) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === spanId);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            const attr = updated[existingIndex].attribute as any;
            const currentArgs = attr.tool_arguments || '';
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                tool_arguments: currentArgs + event.delta,
              } as any,
            };
            return updated;
          } else {
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: spanId,
              parent_span_id: event.parent_span_id,
              operation_name: 'tool_call',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: {
                tool_call_id: event.tool_call_id,
                tool_arguments: event.delta
              } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // Handle ToolCallEnd - Update span to completed
    if (event.type === 'ToolCallEnd') {
      const spanId = event.span_id || event.tool_call_id;
      if (spanId) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === spanId);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              finish_time_us: timestamp * 1000,
              isInProgress: false,
            };
            return updated;
          }
          return prevSpans;
        });
      }
      return;
    }

    // Handle ToolCallResult - Update span with result
    if (event.type === 'ToolCallResult') {
      const spanId = event.span_id || event.tool_call_id;
      if (spanId) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === spanId);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                result: event.content,
                result_role: event.role,
              },
            };
            return updated;
          } else {
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: spanId,
              parent_span_id: event.parent_span_id,
              operation_name: 'tool_call',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: {
                tool_call_id: event.tool_call_id,
                result: event.content,
                result_role: event.role,
              } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // === State Management Events ===

    // Handle StateSnapshot - Update span with state
    if (event.type === 'StateSnapshot') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                state_snapshot: event.snapshot,
              },
            };
            return updated;
          } else {
            if (!event.span_id) {
              return prevSpans;
            }
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: event.span_id,
              parent_span_id: event.parent_span_id,
              operation_name: 'span',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: {
                state_snapshot: event.snapshot,
              } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // Handle StateDelta - Update span with state delta
    if (event.type === 'StateDelta') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                state_delta: event.delta,
              },
            };
            return updated;
          } else {
            if (!event.span_id) {
              return prevSpans;
            }
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: event.span_id,
              parent_span_id: event.parent_span_id,
              operation_name: 'span',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: {
                state_delta: event.delta,
              } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // Handle MessagesSnapshot - Update span with messages
    if (event.type === 'MessagesSnapshot') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                messages_snapshot: event.messages,
              },
            };
            return updated;
          } else {
            if (!event.span_id) {
              return prevSpans;
            }
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: event.span_id,
              parent_span_id: event.parent_span_id,
              operation_name: 'span',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: {
                messages_snapshot: event.messages,
              } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // === Special Events ===

    // Handle RawEvent - Store raw event data
    if (event.type === 'Raw') {
      if (event.span_id) {
        setFlattenSpans((prevSpans) => {
          const existingIndex = prevSpans.findIndex(s => s.span_id === event.span_id);
          if (existingIndex >= 0) {
            const updated = [...prevSpans];
            updated[existingIndex] = {
              ...updated[existingIndex],
              attribute: {
                ...updated[existingIndex].attribute,
                raw_event: event.event,
                raw_event_source: event.source,
              },
            };
            return updated;
          } else {
            if (!event.span_id) {
              return prevSpans;
            }
            // Create new span if it doesn't exist (can happen if subscribed mid-stream)
            const newSpan: Span = {
              span_id: event.span_id,
              parent_span_id: event.parent_span_id,
              operation_name: 'raw',
              thread_id: event.thread_id || '',
              run_id: event.run_id || '',
              trace_id: '',
              start_time_us: timestamp * 1000,
              finish_time_us: undefined,
              attribute: {
                raw_event: event.event,
                raw_event_source: event.source,
              } as any,
              isInProgress: true,
            };
            return [...prevSpans, newSpan];
          }
        });
      }
      return;
    }

    // Handle Custom events
    if (event.type === 'Custom') {
      const customEvent = event as CustomEvent;

      // Handle Custom events with typed event field
      if ('event' in customEvent && customEvent.event) {
        const eventType = customEvent.event;

        // Handle span_start
        if (eventType.type === 'span_start') {
          const span = convertCustomSpanStartToSpan(customEvent, eventType);
          setFlattenSpans((prevSpans) => [...prevSpans, span]);
          return;
        }

        // Handle span_end
        if (eventType.type === 'span_end') {
          const span = convertCustomSpanEndToSpan(customEvent, eventType);
          setFlattenSpans((prevSpans) => {
            const existingIndex = prevSpans.findIndex(s => s.span_id === span.span_id);
            if (existingIndex >= 0) {
              // Update existing in-progress span
              const updated = [...prevSpans];
              updated[existingIndex] = span;
              return updated;
            } else {
              // Add new completed span
              return [...prevSpans, span];
            }
          });
          return;
        }
      }
    }
  }, []);

  // Subscribe to all project events
  useEffect(() => {
    const unsubscribe = subscribe('debug-timeline-events', (event: ProjectEventUnion) => {
      if (isPaused) {
        pausedEventsRef.current.push(event);
      } else {
        processEvents(event);
      }
    });

    return unsubscribe;
  }, [subscribe, projectId, processEvents, isPaused]);

  // Resume and process paused events
  const resume = useCallback(() => {
    setIsPaused(false);
    if (pausedEventsRef.current.length > 0) {
      pausedEventsRef.current.forEach(processEvents);
      pausedEventsRef.current = [];
    }
  }, [processEvents]);

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

  // Group spans by run
  const spansByRun = useMemo(() => {
    const grouped = new Map<string, Span[]>();
    flattenSpans.forEach(span => {
      if (span.run_id) {
        const existing = grouped.get(span.run_id) || [];
        grouped.set(span.run_id, [...existing, span]);
      }
    });
    return grouped;
  }, [flattenSpans]);

  // Group spans by trace
  const spansByTrace = useMemo(() => {
    const grouped = new Map<string, Span[]>();
    flattenSpans.forEach(span => {
      if (span.trace_id) {
        const existing = grouped.get(span.trace_id) || [];
        grouped.set(span.trace_id, [...existing, span]);
      }
    });
    return grouped;
  }, [flattenSpans]);

  const pausedCount = pausedEventsRef.current.length;

  return {
    flattenSpans,
    spanHierarchies,
    spansByThread,
    spansByRun,
    spansByTrace,
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
