import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import {
  ProjectEventUnion,
  LangDBCustomEvent,
  LangDBEventSpan,
  ThreadEventValue,
  ThreadModelStartEvent,
} from '@/contexts/project-events/dto';
import { RunDTO, Span } from '@/types/common-type';
import { Thread } from '@/types/chat';
import { convertToNormalSpan, convertSpanToRunDTO, convertToThreadInfo } from '@/contexts/project-events/util';
import { constructHierarchy, convertToHierarchy, Hierarchy } from '@/contexts/RunDetailContext';

export interface DebugThread extends Thread {
  runs: DebugRun[];
  lastActivity: number;
}

export interface DebugRun extends RunDTO {
  traces: DebugTrace[];
  lastActivity: number;
}

export interface DebugTrace {
  trace_id: string;
  spans: Span[];
  start_time_us: number;
  finish_time_us: number;
  lastActivity: number;
}

export type GroupingLevel = 'threads' | 'runs' | 'traces' | 'spans';

export interface UseDebugTimelineProps {
  projectId: string;
}

export function useDebugTimeline({ projectId }: UseDebugTimelineProps) {
  const { subscribe } = ProjectEventsConsumer();
  const [threads, setThreads] = useState<Map<string, DebugThread>>(new Map());
  const [isPaused, setIsPaused] = useState(false);
  const [groupingLevel, setGroupingLevel] = useState<GroupingLevel>('spans');
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>(undefined);
  const pausedEventsRef = useRef<ProjectEventUnion[]>([]);

  

  // Process a single event and update the hierarchy
  const processEvent = useCallback((event: ProjectEventUnion) => {
    setThreads((prevThreads) => {
      // Ensure prevThreads is a valid Map
      const validPrevThreads = prevThreads instanceof Map ? prevThreads : new Map();
      const newThreads = new Map(validPrevThreads);

      // Handle thread events
      if (event.type === 'Custom') {
        const customEvent = event as LangDBCustomEvent;

        // Thread creation/update
        if (customEvent.name === 'thread_event' && customEvent.thread_id) {
          const threadValue = customEvent.value as ThreadEventValue;
          const threadInfo = convertToThreadInfo(threadValue);

          let thread = newThreads.get(customEvent.thread_id);
          if (thread) {
            // Update existing thread
            newThreads.set(customEvent.thread_id, {
              ...thread,
              ...threadInfo,
              runs: thread.runs,
              lastActivity: event.timestamp || Date.now(),
            });
          } else {
            // Create new thread
            newThreads.set(customEvent.thread_id, {
              ...threadInfo,
              runs: [],
              lastActivity: event.timestamp || Date.now(),
            });
          }
        }

        // Span events - create/update run and add span
        if (customEvent.name === 'span_end' && customEvent.value?.span) {
          const eventSpan = customEvent.value.span as LangDBEventSpan;
          const span = convertToNormalSpan(eventSpan);

          if (span.thread_id && span.run_id) {
            let thread = newThreads.get(span.thread_id);

            // Ensure thread exists
            if (!thread) {
              const newThread: DebugThread = {
                id: span.thread_id,
                project_id: projectId,
                user_id: '',
                model_name: '',
                created_at: new Date(span.start_time_us / 1000).toISOString(),
                updated_at: new Date(span.finish_time_us / 1000).toISOString(),
                runs: [],
                lastActivity: span.finish_time_us / 1000,
                is_from_local: false,
              };
              newThreads.set(span.thread_id, newThread);
              thread = newThread;
            }

            // Find or create run
            const runIndex = thread.runs.findIndex((r: DebugRun) => r.run_id === span.run_id);
            if (runIndex === -1) {
              // Create new run with trace
              const newTrace: DebugTrace = {
                trace_id: span.trace_id,
                spans: [span],
                start_time_us: span.start_time_us,
                finish_time_us: span.finish_time_us,
                lastActivity: span.finish_time_us / 1000,
              };
              const newRun: DebugRun = {
                ...convertSpanToRunDTO(span),
                traces: [newTrace],
                lastActivity: span.finish_time_us / 1000,
              };
              thread = {
                ...thread,
                runs: [newRun, ...thread.runs],
                lastActivity: span.finish_time_us / 1000,
              };
            } else {
              // Update existing run - add span to trace or create new trace
              const existingRun = thread.runs[runIndex];
              const updatedRunDTO = convertSpanToRunDTO(span, existingRun);
              const updatedRuns = [...thread.runs];

              // Find or create trace within run
              const traceIndex = existingRun.traces.findIndex((t: DebugTrace) => t.trace_id === span.trace_id);
              let updatedTraces: DebugTrace[];

              if (traceIndex === -1) {
                // Create new trace
                const newTrace: DebugTrace = {
                  trace_id: span.trace_id,
                  spans: [span],
                  start_time_us: span.start_time_us,
                  finish_time_us: span.finish_time_us,
                  lastActivity: span.finish_time_us / 1000,
                };
                updatedTraces = [newTrace, ...existingRun.traces];
              } else {
                // Add span to existing trace
                updatedTraces = [...existingRun.traces];
                const existingTrace = updatedTraces[traceIndex];
                updatedTraces[traceIndex] = {
                  ...existingTrace,
                  spans: [...existingTrace.spans, span],
                  start_time_us: Math.min(existingTrace.start_time_us, span.start_time_us),
                  finish_time_us: Math.max(existingTrace.finish_time_us, span.finish_time_us),
                  lastActivity: span.finish_time_us / 1000,
                };
              }

              updatedRuns[runIndex] = {
                ...updatedRunDTO,
                traces: updatedTraces,
                lastActivity: span.finish_time_us / 1000,
              };
              thread = {
                ...thread,
                runs: updatedRuns,
                lastActivity: span.finish_time_us / 1000,
              };
            }

            newThreads.set(span.thread_id, thread);
          }
        }

        // Model start events - create run if it doesn't exist
        if (customEvent.name === 'model_start' && customEvent.thread_id && customEvent.run_id) {
          const modelStartEvent = event as ThreadModelStartEvent;
          let thread = newThreads.get(customEvent.thread_id);

          if (!thread) {
            const newThread: DebugThread = {
              id: customEvent.thread_id,
              project_id: projectId,
              user_id: '',
              model_name: '',
              created_at: new Date(event.timestamp || Date.now()).toISOString(),
              updated_at: new Date(event.timestamp || Date.now()).toISOString(),
              runs: [],
              lastActivity: event.timestamp || Date.now(),
              is_from_local: false,
            };
            newThreads.set(customEvent.thread_id, newThread);
            thread = newThread;
          }

          // Check if run exists
          const runIndex = thread.runs.findIndex((r: DebugRun) => r.run_id === customEvent.run_id);
          if (runIndex === -1) {
            // Create new run with empty traces
            const startTime = event.timestamp ? event.timestamp * 1000 : Date.now() * 1000;
            const newRun: DebugRun = {
              run_id: customEvent.run_id,
              thread_ids: [customEvent.thread_id],
              trace_ids: [],
              used_models: [`${modelStartEvent.value.provider_name}/${modelStartEvent.value.model_name}`],
              request_models: [`${modelStartEvent.value.provider_name}/${modelStartEvent.value.model_name}`],
              used_tools: [],
              mcp_template_definition_ids: [],
              cost: 0,
              input_tokens: 0,
              output_tokens: 0,
              start_time_us: startTime,
              finish_time_us: startTime,
              errors: [],
              traces: [],
              lastActivity: event.timestamp || Date.now(),
            };
            thread = {
              ...thread,
              runs: [newRun, ...thread.runs],
              lastActivity: event.timestamp || Date.now(),
            };
            newThreads.set(customEvent.thread_id, thread);
          }
        }
      }

      // Handle events with run_id and thread_id (generic run updates)
      if (event.run_id && event.thread_id) {
        let thread = newThreads.get(event.thread_id);

        if (!thread) {
          const newThread: DebugThread = {
            id: event.thread_id,
            project_id: projectId,
            user_id: '',
            model_name: '',
            created_at: new Date(event.timestamp || Date.now()).toISOString(),
            updated_at: new Date(event.timestamp || Date.now()).toISOString(),
            runs: [],
            lastActivity: event.timestamp || Date.now(),
            is_from_local: false,
          };
          newThreads.set(event.thread_id, newThread);
          thread = newThread;
        }

        const runIndex = thread.runs.findIndex((r: DebugRun) => r.run_id === event.run_id);
        if (runIndex === -1) {
          // Create basic run with empty traces
          const startTime = event.timestamp ? event.timestamp * 1000 : Date.now() * 1000;
          const newRun: DebugRun = {
            run_id: event.run_id,
            thread_ids: [event.thread_id],
            trace_ids: [],
            used_models: [],
            request_models: [],
            used_tools: [],
            mcp_template_definition_ids: [],
            cost: 0,
            input_tokens: 0,
            output_tokens: 0,
            start_time_us: startTime,
            finish_time_us: startTime,
            errors: [],
            traces: [],
            lastActivity: event.timestamp || Date.now(),
          };
          thread = {
            ...thread,
            runs: [newRun, ...thread.runs],
            lastActivity: event.timestamp || Date.now(),
          };
        } else {
          thread = {
            ...thread,
            lastActivity: event.timestamp || Date.now(),
          };
        }

        newThreads.set(event.thread_id, thread);
      }

      return newThreads;
    });
  }, [projectId]);

  // Subscribe to all project events
  useEffect(() => {
    const unsubscribe = subscribe('debug-timeline-events', (event: ProjectEventUnion) => {
      if (isPaused) {
        pausedEventsRef.current.push(event);
      } else {
        console.log('==== Processing event:', event);
        processEvent(event);
      }
    });

    return unsubscribe;
  }, [subscribe, projectId, processEvent, isPaused]);

  // Resume and process paused events
  const resume = useCallback(() => {
    setIsPaused(false);
    if (pausedEventsRef.current.length > 0) {
      pausedEventsRef.current.forEach(processEvent);
      pausedEventsRef.current = [];
    }
  }, [processEvent]);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const clear = useCallback(() => {
    setThreads(new Map());
    pausedEventsRef.current = [];
    setSelectedSpanId(undefined);
  }, []);

  // Convert map to sorted array
  const sortedThreads = useMemo(
    () => {
      if (!threads || !(threads instanceof Map)) return [];
      return Array.from(threads.values()).sort((a, b) => a.lastActivity - b.lastActivity);
    },
    [threads]
  );

  const flatSpans = useMemo<Span[]>(() => {
    const entries: Span[] = [];
    if (!threads || !(threads instanceof Map)) return entries;
    for (const thread of threads.values()) {
      for (const run of thread.runs) {
        for (const trace of run.traces) {
          for (const span of trace.spans) {
            entries.push(span);
          }
        }
      }
    }
    return entries.sort((a, b) => a.start_time_us - b.start_time_us);
  }, [threads]);

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId) return null;
    return flatSpans.find(span => span.span_id === selectedSpanId);
  }, [selectedSpanId, flatSpans]);

  // Flatten to runs (all runs from all threads)
  const flatRuns = useMemo<DebugRun[]>(() => {
    const entries: DebugRun[] = [];
    if (!threads || !(threads instanceof Map)) return entries;
    for (const thread of threads.values()) {
      for (const run of thread.runs) {
        entries.push(run);
      }
    }
    return entries.sort((a, b) => a.start_time_us - b.start_time_us);
  }, [threads]);

  // Flatten to traces (all traces from all runs)
  const flatTraces = useMemo<DebugTrace[]>(() => {
    const entries: DebugTrace[] = [];
    if (!threads || !(threads instanceof Map)) return entries;
    for (const thread of threads.values()) {
      for (const run of thread.runs) {
        for (const trace of run.traces) {
          entries.push(trace);
        }
      }
    }
    return entries.sort((a, b) => a.start_time_us - b.start_time_us);
  }, [threads]);

  const pausedCount = pausedEventsRef.current.length;

  const spanHierarchies: Record<string, Hierarchy> = useMemo(() => convertToHierarchy({ spans: flatSpans, isDisplayGraph: false }), [flatSpans]);

  return {
    threads: sortedThreads,
    runs: flatRuns,
    traces: flatTraces,
    spans: flatSpans,
    spanHierarchies,
    groupingLevel,
    setGroupingLevel,
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
