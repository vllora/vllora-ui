import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useThreadState } from './threads/useThreadState';
import { useThreadChanges } from './threads/useThreadChanges';
import { useThreadPagination } from './threads/useThreadPagination';
import { useThreadOperations } from './threads/useThreadOperations';
import { ProjectsConsumer } from './ProjectContext';
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDebugControl } from '@/hooks/events/useDebugControl';
import { ProjectEventUnion } from './project-events/dto';
import { Thread } from '@/types/chat';
import { updateThreadFromEvent } from '@/hooks/events/utilities/update-thread-from-event';

export type ThreadsContextType = ReturnType<typeof useThreads>;

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);

interface ThreadsProviderProps {
  projectId: string;
}

export function useThreads({ projectId }: ThreadsProviderProps) {
  const { currentProjectId, isDefaultProject } = ProjectsConsumer();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Base state management
  const threadState = useThreadState();
  const { setThreads, selectedThreadId } = threadState;

  // Thread changes tracking
  const threadChangesState = useThreadChanges(threadState);
  // Pagination and loading
  const paginationState = useThreadPagination(projectId, threadState, threadChangesState);

  // CRUD operations
  const operations = useThreadOperations(projectId, threadState, paginationState.refreshThreads);
  const handleThreadClick = useCallback((inputThreadId: string, inputModels: string[]) => {
    if (!currentProjectId) return;
    if (selectedThreadId === inputThreadId) return;
    const params = new URLSearchParams(searchParams);
    params.set('threadId', inputThreadId);
    if (!isDefaultProject(currentProjectId)) {
      params.set('project_id', currentProjectId);
    } else {
      params.delete('project_id');
    }
    // Set model parameter from input_models if available
    if (inputModels && inputModels.length > 0) {
      const lastModel = inputModels[inputModels.length - 1];
      params.set('model', lastModel);
    }
    navigate(`/chat?${params.toString()}`);
  }, [currentProjectId, navigate, searchParams, isDefaultProject, selectedThreadId]);

  
  
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
    threads: threadState.threads,
    selectedThreadId: threadState.selectedThreadId,
    isRightSidebarCollapsed: threadState.isRightSidebarCollapsed,
    setIsRightSidebarCollapsed: threadState.setIsRightSidebarCollapsed,

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
    addThreadByEvent: operations.addThreadByEvent,
    updateThreadCost: operations.updateThreadCost,

    // Thread changes
    threadsHaveChanges: threadChangesState.threadsHaveChanges,

    handleThreadClick
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
