import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Thread } from '@/types/chat';
import { queryThreads, updateThreadTitle, deleteThread as deleteThreadApi } from '@/services/threads-api';

interface ThreadsContextType {
  threads: Thread[];
  loading: boolean;
  loadingMore: boolean;
  loadingThreadsError: string | null;
  selectedThreadId: string | null;
  total: number;
  offset: number;
  hasMore: boolean;
  refreshThreads: () => Promise<void>;
  loadMoreThreads: () => Promise<void>;
  selectThread: (threadId: string | null) => void;
  renameThread: (threadId: string, title: string) => Promise<void>;
  deleteThread: (threadId: string) => void;
  addThread: (thread: Thread) => void;
  updateThread: (threadId: string, updates: Partial<Thread>) => void;
}

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);

interface ThreadsProviderProps {
  children: ReactNode;
  projectId: string;
}

export function ThreadsProvider({ children, projectId }: ThreadsProviderProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadingThreadsError, setLoadingThreadsError] = useState<string | null>(null);

  const refreshThreads = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    try {
      const response = await queryThreads(projectId, {
        order_by: [['updated_at', 'desc']],
        limit: 100,
        offset: 0,
      });
      const pagination = response.pagination;
      const newThreads = response.data.map((t: Thread) => ({
        ...t,
        created_at: new Date(Date.parse(t.created_at + 'Z')).toString(),
        updated_at: new Date(Date.parse(t.updated_at + 'Z')).toString(),
      }));
      setThreads(newThreads);
      setTotal(pagination.total);
      setOffset(pagination.offset + newThreads.length);
      setHasMore(pagination.limit + pagination.offset < pagination.total);
      setLoadingThreadsError(null);
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to load threads';
      setLoadingThreadsError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadMoreThreads = useCallback(async () => {
    setLoadingMore((currentLoadingMore) => {
      if (currentLoadingMore) return true;

      // Use functional updates to get current values
      setLoading((currentLoading) => {
        if (currentLoading) {
          setLoadingMore(false);
          return currentLoading;
        }

        setHasMore((currentHasMore) => {
          if (!currentHasMore) {
            setLoadingMore(false);
            return currentHasMore;
          }

          // Proceed with loading
          setOffset((currentOffset) => {
            queryThreads(projectId, {
              order_by: [['updated_at', 'desc']],
              limit: 100,
              offset: currentOffset,
            })
              .then((response) => {
                const pagination = response.pagination;
                const newThreads = response.data.map((t: Thread) => ({
                  ...t,
                  created_at: new Date(Date.parse(t.created_at + 'Z')).toString(),
                  updated_at: new Date(Date.parse(t.updated_at + 'Z')).toString(),
                }));
                setThreads((prev) => [...prev, ...newThreads]);
                setOffset((prev) => prev + newThreads.length);
                setTotal((prev) => prev + newThreads.length);
                setHasMore(newThreads.length === pagination.limit);
                setLoadingMore(false);
              })
              .catch((e: any) => {
                const errorMessage = e.message || 'Failed to load more threads';
                setLoadingThreadsError(errorMessage);
                setLoadingMore(false);
              });

            return currentOffset;
          });

          return currentHasMore;
        });

        return currentLoading;
      });

      return true;
    });
  }, [projectId]);

  const selectThread = useCallback((threadId: string | null) => {
    setSelectedThreadId(threadId);
  }, []);

  const renameThread = useCallback(
    async (threadId: string, title: string) => {
      try {
        await updateThreadTitle({ threadId, title, projectId });
        setThreads((prev) =>
          prev.map((thread) => (thread.id === threadId ? { ...thread, title } : thread))
        );
        await refreshThreads();
        toast.success('Thread renamed successfully');
      } catch (err: any) {
        toast.error('Failed to rename thread', {
          description: err.message,
        });
        throw err;
      }
    },
    [projectId, refreshThreads]
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadApi(projectId, threadId);
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
        if (selectedThreadId === threadId) {
          setSelectedThreadId(null);
        }
        toast.success('Thread deleted');
      } catch (err: any) {
        toast.error('Failed to delete thread', {
          description: err.message,
        });
      }
    },
    [projectId, selectedThreadId]
  );

  const addThread = useCallback((thread: Thread) => {
    setThreads((prev) => [thread, ...prev]);
    setTotal((prev) => prev + 1);
  }, []);

  const updateThread = useCallback((threadId: string, updates: Partial<Thread>) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? { ...thread, ...updates, updated_at: new Date().toISOString() }
          : thread
      )
    );
  }, []);

  const value: ThreadsContextType = {
    threads,
    loading,
    loadingMore,
    loadingThreadsError,
    selectedThreadId,
    total,
    offset,
    hasMore,
    refreshThreads,
    loadMoreThreads,
    selectThread,
    renameThread,
    deleteThread,
    addThread,
    updateThread,
  };

  return <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>;
}

export function ThreadsConsumer() {
  const context = useContext(ThreadsContext);
  if (context === undefined) {
    throw new Error('ThreadsConsumer must be used within a ThreadsProvider');
  }
  return context;
}
