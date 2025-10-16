'use client'
import { useCallback, useEffect, useRef, useState } from "react";
import { createContext, ReactNode, useContext } from "react";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { ProjectEventUnion, ProjectEventsHookProps, ProjectEventsState } from './dto';
import { getEventsUrl } from "@/config/api";

export const useProjectEvents = (props: ProjectEventsHookProps) => {
  const { projectId } = props;
  const [state, setState] = useState<ProjectEventsState>({
    isConnected: false,
    isConnecting: false,
    error: null
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnectRef = useRef(false);
  const isConnectingRef = useRef(false);
  const projectIdRef = useRef(projectId);

  // Observable pattern - store subscribers instead of events
  const subscribersRef = useRef<Map<string, (event: ProjectEventUnion) => void>>(new Map());

  // Update projectId ref when it changes and clear subscribers
  useEffect(() => {

    if(projectIdRef.current === projectId)  {
      return;
    }
    projectIdRef.current = projectId;
    // Clear subscribers when projectId changes to prevent cross-project event pollution
    subscribersRef.current.clear();
  }, [projectId]);

  // Observable methods
  const subscribe = useCallback((id: string, callback: (event: ProjectEventUnion) => void, filter?: (event: ProjectEventUnion) => boolean) => {

    // check if the callback is already subscribed, if so, return
    if(subscribersRef.current.has(id)) {
      return;
    }

    const wrappedCallback = filter ? (event: ProjectEventUnion) => {
      if (filter(event)) {
        callback(event);
      }
    } : callback;

    subscribersRef.current.set(id, wrappedCallback);
    return () => {
      subscribersRef.current.delete(id);
    };
  }, []);

  const emit = useCallback((event: ProjectEventUnion) => {
    // Use requestIdleCallback to defer event emission and prevent blocking UI
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        subscribersRef.current.forEach(callback => {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in event subscriber:', error);
          }
        });
      }, { timeout: 50 }); // Max 50ms timeout to ensure events are processed timely
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        subscribersRef.current.forEach(callback => {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in event subscriber:', error);
          }
        });
      }, 0);
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    isConnectingRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: null
    }));
  }, []);

  const connect = useCallback(async () => {
    // Ensure only one connection attempt at a time
    if (!projectIdRef.current || isConnectingRef.current) {
      return;
    }

    // Mark as connecting atomically
    isConnectingRef.current = true;

    // Disconnect any existing connection first
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Create new abort controller
      abortControllerRef.current = new AbortController();
      const eventsUrl = getEventsUrl();

      await fetchEventSource(eventsUrl, {
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'x-project-id': projectIdRef.current
        },
        signal: abortControllerRef.current.signal,
        onopen: async (response) => {
          if (response.ok) {
            setState(prev => ({
              ...prev,
              isConnected: true,
              isConnecting: false,
              error: null
            }));
            isConnectingRef.current = false;
          } else {
            // Throw error to prevent automatic retries for client errors
            const errorMessage = `Failed to connect: ${response.status} ${response.statusText}`;
            throw new Error(errorMessage);
          }
        },
        onmessage: (event) => {
          try {
            const parsedData = JSON.parse(event.data);

            // The backend sends events with proper structure, use directly
            const projectEvent: ProjectEventUnion = {
              ...parsedData,
              timestamp: parsedData.timestamp || Date.now()
            } as ProjectEventUnion;
            let ignoreThisEvent = projectEvent.type === 'Custom' && (projectEvent.event?.type === 'ping' || (projectEvent.type === 'Custom' &&projectEvent.event && !projectEvent.run_id))
            if (!ignoreThisEvent) {
              console.log('==== Received event:', parsedData);
              // Emit to subscribers instead of storing in array
              emit(projectEvent);
            }
          } catch (error) {
            console.warn('Failed to parse project event:', error);
          }
        },
        onerror: (error) => {
          isConnectingRef.current = false;
          setState(prev => ({
            ...prev,
            isConnected: false,
            isConnecting: false,
            error: error.message || 'Connection error'
          }));

          // Throw error to stop automatic retries
          throw error;
        },
        onclose: () => {
          isConnectingRef.current = false;
          setState(prev => ({
            ...prev,
            isConnected: false,
            isConnecting: false
          }));

          // Throw error to prevent automatic reconnection
          throw new Error('Connection closed');
        },
        openWhenHidden: true,
      });
    } catch (error: any) {
      console.warn('Failed to connect to project events:', error);
      isConnectingRef.current = false;
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: error.message || 'Connection failed'
      }));
    }
  }, []);

  const startSubscription = useCallback(() => {
    shouldConnectRef.current = true;
    connect();
  }, [connect]);

  const stopSubscription = useCallback(() => {
    disconnect();
  }, [disconnect]);

  // Auto-start subscription when projectId changes
  useEffect(() => {
    if (projectId) {
      // Disconnect any existing connection first
      disconnect();

      // Short delay to ensure cleanup is complete
      const timer = setTimeout(() => {
        // Double-check that we still have the same projectId and should connect
        if (projectIdRef.current === projectId && projectId) {
          // Auto-start subscription only if not already connecting
          if (!isConnectingRef.current) {
            shouldConnectRef.current = true;
            connect();
          }
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        // Ensure disconnection when effect cleans up
        disconnect();
      };
    }

    // Cleanup if no projectId
    return () => {
      disconnect();
    };
  }, [projectId]); // Only depend on projectId, not functions

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []); // Empty dependency array since disconnect is stable

  return {
    projectId,
    ...state,
    startSubscription,
    stopSubscription,
    subscribe
  };
};

export type ProjectEventsContextType = ReturnType<typeof useProjectEvents>;

export const ProjectEventsContext = createContext<ProjectEventsContextType | null>(null);

export function ProjectEventsProvider({ children, projectId }: { children: ReactNode, projectId: string }) {
  const value = useProjectEvents({ projectId });
  return <ProjectEventsContext.Provider value={value}>{children}</ProjectEventsContext.Provider>;
}

export function ProjectEventsConsumer() {
  const value = useContext(ProjectEventsContext);
  if (value === null) {
    throw new Error("ProjectEventsConsumer must be used within a ProjectEventsProvider");
  }
  return value;
}
