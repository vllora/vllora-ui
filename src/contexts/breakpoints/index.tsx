'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createContext, ReactNode, useContext } from 'react';
import { toast } from 'sonner';
import { api, handleApiResponse } from '@/lib/api-client';
import { BreakpointsState, BreakpointsResponse, SetGlobalBreakpointResponse, ContinueBreakpointResponse } from './dto';
import { ProjectEventUnion } from '../project-events/dto';
import { useDebugControl } from '@/hooks/events/useDebugControl';
import {
  CustomEvent,
  CustomBreakpointEventType,
} from "@/contexts/project-events/dto";
import { ProjectEventsConsumer } from '../project-events';
import { CurrentAppConsumer } from '../CurrentAppContext';
export const useBreakpointsState = (projectId: string) => {

  const { app_mode } = CurrentAppConsumer()
  const { emit } = ProjectEventsConsumer()
  const [state, setState] = useState<BreakpointsState>({
    isDebugActive: false,
    isLoading: true,
    breakpoints: [],
    interceptAll: false,
    error: null,
  });

  const isMountedRef = useRef(true);

  const fetchBreakpoints = useCallback(async () => {
    try {
      const response = await api.get('/debug/breakpoints');
      const data = await handleApiResponse<BreakpointsResponse>(response);

      if (isMountedRef.current) {
        const breakpoints = data.breakpoints ?? [];
        const isDebugActive = breakpoints.length > 0 || data.intercept_all;

        // Update state first
        setState({
          isDebugActive,
          isLoading: false,
          breakpoints,
          interceptAll: data.intercept_all,
          error: null,
        });

        // Emit events after state is set, with error handling
        if (isDebugActive) {
          const listOfEvents = breakpoints
            .flatMap(b => b.events ?? [])
            .filter(Boolean);
          // sort event by timestamp chronical order
          listOfEvents.sort((a, b) => a.timestamp - b.timestamp).forEach(e => {
            try {
              emit(e);
            } catch (err) {
              console.error('Failed to emit event:', err);
            }
          });
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch breakpoints',
        }));
      }
    }
  }, [emit]);
  const continueAllBreakpoints = useCallback(async () => {
    try {
      const response = await api.post('/debug/continue/all');
      await handleApiResponse<{ status: string }>(response);
      fetchBreakpoints();
    } catch (err) {
      toast.error('Failed to continue all breakpoints');
    }
  }, [fetchBreakpoints]);
  const toggleDebugMode = useCallback(async () => {
    try {
      const newState = !state.isDebugActive;
      if (!newState) {
        await api.post('/debug/continue/all');
      }
      const response = await api.post('/debug/global_breakpoint', {
        intercept_all: newState,
      });
      await handleApiResponse<SetGlobalBreakpointResponse>(response);
      fetchBreakpoints();
      // Immediately update state optimistically
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isDebugActive: newState,
          interceptAll: newState,
        }));
      }

      toast.success(newState ? 'Debug mode enabled' : 'Debug mode disabled');
    } catch (err) {
      toast.error('Failed to toggle debug mode');
    }
  }, [state.isDebugActive, fetchBreakpoints]);

  const refresh = useCallback(() => {
    fetchBreakpoints();
  }, [fetchBreakpoints]);

  const continueBreakpoint = useCallback(async (breakpointId: string, request?: unknown) => {
    try {
      const response = await api.post('/debug/continue', {
        breakpoint_id: breakpointId,
        action: request ?? null, // null for Continue, or the request object for ModifyRequest
      });
      await handleApiResponse<ContinueBreakpointResponse>(response);
      toast.success('Breakpoint continued');
    } catch (err: any) {
      toast.error(`Failed to continue breakpoint: ${err.message || err.error || JSON.stringify(err)}`);
    }
  }, []);



  // Fetch on mount and when projectId changes
  useEffect(() => {
    isMountedRef.current = true;
    // Reset state when projectId changes
    setState({
      isDebugActive: false,
      isLoading: app_mode === 'langdb' ? false : true,
      breakpoints: [],
      interceptAll: false,
      error: null,
    });

    // Skip fetching breakpoints for langdb mode
    if (app_mode !== 'langdb') {
      fetchBreakpoints();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [projectId, fetchBreakpoints, app_mode]);

  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.type === "Custom") {
      const customEvent = event as unknown as CustomEvent;
      if ("event" in customEvent && customEvent.event) {
        const eventType = customEvent.event;

        if (eventType.type === "breakpoint") {
          const breakpointEvent = eventType as CustomBreakpointEventType;
          const span_id = customEvent.span_id;

          if (!span_id) return;

          setState(prev => {
            if (prev.breakpoints.some(b => b.breakpoint_id === span_id)) {
              return {
                ...prev,
                breakpoints: prev.breakpoints.map(b => {
                  if (b.breakpoint_id === span_id) {
                    return {
                      ...b,
                      request: breakpointEvent.request
                    };
                  }
                  return b;
                }),
              };
            } else {
              return {
                ...prev,
                breakpoints: [...prev.breakpoints, {
                  breakpoint_id: span_id,
                  request: breakpointEvent.request,
                  events: [],
                  thread_id: customEvent.thread_id || ''
                }],

              };
            }
          });
        }
        if (eventType.type === "breakpoint_resume") {
          let span_id = customEvent.span_id;
          span_id && setState(prev => {
            return {
              ...prev,
              breakpoints: prev.breakpoints.filter(b => b.breakpoint_id !== span_id)
            }
          });
          return;
        }
        if (eventType.type === "global_breakpoint") {
          setState(prev => {
            return {
              ...prev,
              isDebugActive: eventType.intercept_all,
              breakpoints: [],
              error: null,
            }
          })
          return
        }
      }
    }
  }, []);


  useDebugControl({ handleEvent, channel_name: 'breakpoints-control' });

  return {
    ...state,
    toggleDebugMode,
    refresh,
    continueBreakpoint,
    continueAllBreakpoints,
  };
};

export type BreakpointsContextType = ReturnType<typeof useBreakpointsState>;

export const BreakpointsContext = createContext<BreakpointsContextType | null>(null);

export function BreakpointsProvider({ children, projectId }: { children: ReactNode; projectId: string }) {
  const value = useBreakpointsState(projectId);
  return <BreakpointsContext.Provider value={value}>{children}</BreakpointsContext.Provider>;
}

export function BreakpointsConsumer() {
  const value = useContext(BreakpointsContext);
  if (value === null) {
    throw new Error('BreakpointsConsumer must be used within a BreakpointsProvider');
  }
  return value;
}
