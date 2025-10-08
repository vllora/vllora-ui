import { createContext, useContext, ReactNode } from 'react';
import { useThreadState } from './threads/useThreadState';
import { useThreadChanges } from './threads/useThreadChanges';
import { useThreadPagination } from './threads/useThreadPagination';
import { useThreadOperations } from './threads/useThreadOperations';

export type ThreadsContextType = ReturnType<typeof useThreads>;

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);

interface ThreadsProviderProps {
  projectId: string;
}

export function useThreads({ projectId }: ThreadsProviderProps) {
  // Base state management
  const threadState = useThreadState();

  // Thread changes tracking
  const threadChangesState = useThreadChanges(threadState);

  // Pagination and loading
  const paginationState = useThreadPagination(projectId, threadState, threadChangesState);

  // CRUD operations
  const operations = useThreadOperations(projectId, threadState, paginationState.refreshThreads);

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
    onThreadMessageHaveChanges: threadChangesState.onThreadMessageHaveChanges,
    threadsHaveChanges: threadChangesState.threadsHaveChanges,
    onThreadMessageCreated: threadChangesState.onThreadMessageCreated,
    onThreadModelStartEvent: threadChangesState.onThreadModelStartEvent,
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
