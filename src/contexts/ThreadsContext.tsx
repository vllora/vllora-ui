import { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useThreadState } from './threads/useThreadState';
import { useThreadChanges } from './threads/useThreadChanges';
import { useThreadPagination } from './threads/useThreadPagination';
import { useThreadOperations } from './threads/useThreadOperations';
import { ProjectsConsumer } from './ProjectContext';
import { useSearchParams, useNavigate } from "react-router";
import { useDebugControl } from '@/hooks/events/useDebugControl';
import { ProjectEventUnion } from './project-events/dto';
import { Thread } from '@/types/chat';
import { updateThreadFromEvent } from '@/hooks/events/utilities/update-thread-from-event';

export type ThreadsContextType = ReturnType<typeof useThreads>;

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);

// Allowed query params for threads/chat page
const ALLOWED_QUERY_PARAMS = ['tab', 'threadId', 'project_id', 'model'] as const;

interface ThreadsProviderProps {
  projectId: string;
}

export function useThreads({ projectId }: ThreadsProviderProps) {
  const {  isDefaultProject } = ProjectsConsumer();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Base state management
  const threadState = useThreadState();
  const { setThreads, selectedThreadId } = threadState;

  // Thread changes tracking
  const threadChangesState = useThreadChanges(threadState);
  // Pagination and loading
  const paginationState = useThreadPagination(projectId, threadState, threadChangesState);

  // CRUD operations
  const operations = useThreadOperations(projectId, threadState, paginationState.refreshThreads);

  // Clean up URL - remove unsupported query params
  useEffect(() => {
    const newParams = new URLSearchParams();
    let hasUnsupportedParams = false;

    // Only keep allowed params
    ALLOWED_QUERY_PARAMS.forEach(param => {
      const value = searchParams.get(param);
      if (value) {
        newParams.set(param, value);
      }
    });
    newParams.set('tab', 'threads');

    // Check if we need to clean up
    searchParams.forEach((_, key) => {
      if (!ALLOWED_QUERY_PARAMS.includes(key as any)) {
        hasUnsupportedParams = true;
      }
    });

    // Only update if there are unsupported params to remove
    if (hasUnsupportedParams) {
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]); // Run when URL changes
  const handleThreadClick = useCallback((inputThreadId: string, inputModels: string[]) => {
    if (!projectId) return;
    if (selectedThreadId === inputThreadId) return;

    // Create clean params with only allowed query params
    const params = new URLSearchParams();

    // Preserve only allowed params from current URL (except threadId, project_id, model which we'll set)
    ALLOWED_QUERY_PARAMS.forEach(param => {
      const value = searchParams.get(param);
      if (value && param !== 'threadId' && param !== 'project_id' && param !== 'model') {
        params.set(param, value);
      }
    });

    // Set our managed params
    params.set('threadId', inputThreadId);
    params.set('tab', 'threads');

    if (!isDefaultProject(projectId)) {
      params.set('project_id', projectId);
    }

    // Set model parameter from input_models if available
    if (inputModels && inputModels.length > 0) {
      const lastModel = inputModels[inputModels.length - 1];
      params.set('model', lastModel);
    }

    navigate(`/chat?${params.toString()}`);
  }, [projectId, navigate, searchParams, isDefaultProject, selectedThreadId]);

  
  
  const handleEvent = useCallback((event: ProjectEventUnion) => {
    if (event.thread_id) {
      setThreads((prevThreads) => {
        const threadIndex = prevThreads.findIndex((thread) => thread.thread_id === event.thread_id);
        if (threadIndex === -1) {
          let newThread: Thread = {
            thread_id: event.thread_id!,
            is_from_local: false,
            start_time_us: event.timestamp,
            finish_time_us: event.timestamp,
            run_ids: event.run_id ? [event.run_id] : [],
            input_models: [],
            cost: 0,
          };
          newThread = updateThreadFromEvent(newThread, event);
          return [newThread, ...prevThreads];
        } else {
          let updatedThread: Thread = updateThreadFromEvent(prevThreads[threadIndex], event)
          return [...prevThreads.slice(0, threadIndex), updatedThread, ...prevThreads.slice(threadIndex + 1)];
        }
      });
      if (selectedThreadId != event.thread_id) {
        handleThreadClick(event.thread_id!, []);
      }
    }
  }, [selectedThreadId]);
  useDebugControl({ handleEvent, channel_name: 'debug-thread-events' });


  return {
    // Thread state
    ...threadState,

    // Pagination state
    loading: paginationState.loading,
    loadingMore: paginationState.loadingMore,
    loadingThreadsError: paginationState.loadingThreadsError,
    total: paginationState.total,
    offset: paginationState.offset,
    hasMore: paginationState.hasMore,
    refreshThreads: paginationState.refreshThreads,
    loadMoreThreads: paginationState.loadMoreThreads,

    // Thread operations
    renameThread: operations.renameThread,
    deleteThread: operations.deleteThread,
    deleteDraftThread: operations.deleteDraftThread,
    addThread: operations.addThread,
    updateThread: operations.updateThread,

    // Thread changes
    threadsHaveChanges: threadChangesState.threadsHaveChanges,

    handleThreadClick,
    projectId,
  };
}

export function ThreadsProvider({ children, projectId }: { children: ReactNode; projectId: string }) {
  const value = useThreads({ projectId });
  return <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>;
}

export function ThreadsConsumer() {
  const context = useContext(ThreadsContext);
  if (context === undefined) {
    throw new Error('ThreadsConsumer must be used within a ThreadsProvider');
  }
  return context;
}
