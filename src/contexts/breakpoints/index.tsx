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
export const useBreakpointsState = (projectId: string) => {
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
        const isDebugActive = data.breakpoints.length > 0 || data.intercept_all;
        setState({
          isDebugActive,
          isLoading: false,
          breakpoints: data.breakpoints,
          interceptAll: data.intercept_all,
          error: null,
        });
      }
    } catch (err) {
      console.error('Failed to fetch breakpoints:', err);
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch breakpoints',
        }));
      }
    }
  }, []);

  const toggleDebugMode = useCallback(async () => {
    try {
      const newState = !state.isDebugActive;
      const response = await api.post('/debug/global_breakpoint', {
        intercept_all: newState,
      });
      await handleApiResponse<SetGlobalBreakpointResponse>(response);

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
      console.error('Failed to toggle debug mode:', err);
      toast.error('Failed to toggle debug mode');
    }
  }, [state.isDebugActive]);

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
    } catch (err) {
      console.error('Failed to continue breakpoint:', err);
      toast.error('Failed to continue breakpoint');
    }
  }, []);

  const continueAllBreakpoints = useCallback(async () => {
    try {
      const response = await api.post('/debug/continue/all');
      await handleApiResponse<{ status: string }>(response);
      fetchBreakpoints();
    } catch (err) {
      console.error('Failed to continue all breakpoints:', err);
      toast.error('Failed to continue all breakpoints');
    }
  }, []);

  // Fetch on mount and when projectId changes
  useEffect(() => {
    isMountedRef.current = true;
    // Reset state when projectId changes
    setState({
      isDebugActive: false,
      isLoading: true,
      breakpoints: [],
      interceptAll: false,
      error: null,
    });
    fetchBreakpoints();

    return () => {
      isMountedRef.current = false;
    };
  }, [projectId, fetchBreakpoints]);

  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.type === "Custom") {
      console.log('==== event', event)
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
                  request: breakpointEvent.request
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
      }
    }
  }, [setState]);


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
