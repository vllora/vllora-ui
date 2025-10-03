import { createContext, useContext, ReactNode, useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Thread } from '@/types/chat';
import { queryThreads, updateThreadTitle, deleteThread as deleteThreadApi } from '@/services/threads-api';
import { CostValueData, MessageCreatedEvent, TextMessageContentEvent, TextMessageEndEvent, TextMessageStartEvent, ThreadEventValue, ThreadModelStartEvent } from './project-events/dto';
import { convertToThreadInfo } from './project-events/util';

export type ThreadsContextType = ReturnType<typeof useThreads>;

const ThreadsContext = createContext<ThreadsContextType | undefined>(undefined);
const convertToTime = (dateString: string): Date => {
  // handle case like this: "Thu Jul 10 2025 12:59:06 GMT+0700 (Indochina Time)"
  if (dateString.includes('GMT')) {
    return new Date(dateString);
  }
  const isoString = dateString.replace(/(\d{4}-\d{2}-\d{2})\s+(.+)/, '$1T$2Z');
  return new Date(isoString);
}

const sortThreads = (threads: Thread[]) => {
  return [...threads].sort((a, b) => {
    const dateA = convertToTime(a.updated_at);
    const dateB = convertToTime(b.updated_at);
    return dateB.getTime() - dateA.getTime();
  });
}
interface ThreadsProviderProps {
  projectId: string;
}

export function useThreads({ projectId }: ThreadsProviderProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadingThreadsError, setLoadingThreadsError] = useState<string | null>(null);

  const [threadsHaveChanges, setThreadsHaveChanges] = useState<{
    [threadId: string]: {
      messages: {
        message_id: string;
        status: 'start' | 'streaming' | 'end',
        timestamp: number
      }[]
    }
  }>({});

  // Read selectedThreadId from URL query string
  const selectedThreadId = useMemo(() => {
    return searchParams.get('threadId');
  }, [searchParams]);

  // Clear thread changes when user selects/views a thread
  useEffect(() => {
    if (selectedThreadId) {
      setThreadsHaveChanges((prev) => {
        const updated = { ...prev };
        delete updated[selectedThreadId];
        return updated;
      });
    }
  }, [selectedThreadId]);

  const onThreadMessageHaveChanges = useCallback((input: {
    threadId: string;
    event: TextMessageStartEvent | TextMessageEndEvent | TextMessageContentEvent
  }) => {
    const { threadId, event } = input;

    // Helper to get status from event type
    const getStatus = (type: string): 'start' | 'streaming' | 'end' =>
      type === 'TextMessageStart' ? 'start' : type === 'TextMessageContent' ? 'streaming' : 'end';

    // Create new message entry
    const newMessage = {
      message_id: event.message_id,
      status: getStatus(event.type),
      timestamp: event.timestamp
    };

    setThreadsHaveChanges((prev) => {
      // Get existing messages, filter out old entry for this message_id, add new entry, and sort
      const existingMessages = prev[threadId]?.messages || [];
      const updatedMessages = [
        ...existingMessages.filter((m) => m.message_id !== event.message_id),
        newMessage
      ].sort((a, b) => b.timestamp - a.timestamp);

      return {
        ...prev,
        [threadId]: { messages: updatedMessages }
      };
    });
    // update the update_at in thread, current value updated_at have format "2025-07-10 06:00:33"
    let newUpdatedAt = event.timestamp;
    // convert newUpdatedAt (timestamp number in milliseconds) to format "2025-07-10 06:00:33"
    const newUpdatedAtString = format(new Date(newUpdatedAt), 'yyyy-MM-dd HH:mm:ss');
    setThreads((prev) => {
      const updatedThreads = prev.map((thread) => (thread.id === threadId ? { ...thread, updated_at: newUpdatedAtString } : thread));
      return sortThreads(updatedThreads);
    });
  }, []);

  const onThreadModelStartEvent = useCallback((input: {
    threadId: string;
    event: ThreadModelStartEvent
  }) => {
    const { threadId, event } = input;
    // update the update_at in thread, current value updated_at have format "2025-07-10 06:00:33"
    let newUpdatedAt = event.timestamp;
    // convert newUpdatedAt (timestamp number in milliseconds) to format "2025-07-10 06:00:33"
    const newUpdatedAtString = format(new Date(newUpdatedAt), 'yyyy-MM-dd HH:mm:ss');
    setThreads((prev) => {
      const updatedThreads = prev.map((thread) =>{
        if(thread.id === threadId) {
          // Create unique array of input models with new model added
          let newModelName = event.value.provider_name ? `${event.value.provider_name}/${event.value.model_name}` : event.value.model_name;
          const newInputModels = [...new Set([...(thread.input_models || []), newModelName])];
          return {
            ...thread,
            updated_at: newUpdatedAtString,
            input_models: newInputModels,
            request_model_name: event.value.model_name,
          };
        }
        return thread;
      });
      let result = sortThreads(updatedThreads);
      return result;
    });
  }, []);

  const onThreadMessageCreated = useCallback((input: {
    threadId: string;
    event: MessageCreatedEvent
  }) => {
    const { threadId, event } = input;

    // Create new message entry
    const newMessage = {
      message_id: event.value.message_id,
      status: 'end' as const,
      timestamp: event.timestamp
    };

    setThreadsHaveChanges((prev) => {
      // Get existing messages, filter out old entry for this message_id, add new entry, and sort
      const existingMessages = prev[threadId]?.messages || [];
      const updatedMessages = [
        ...existingMessages.filter((m) => m.message_id !== event.value.message_id),
        newMessage
      ].sort((a, b) => b.timestamp - a.timestamp);

      return {
        ...prev,
        [threadId]: { messages: updatedMessages }
      };
    });
    // update the update_at in thread, current value updated_at have format "2025-07-10 06:00:33"
    let newUpdatedAt = event.timestamp;
    // convert newUpdatedAt (timestamp number in milliseconds) to format "2025-07-10 06:00:33"
    const newUpdatedAtString = format(new Date(newUpdatedAt), 'yyyy-MM-dd HH:mm:ss');
    setThreads((prev) => {
      const updatedThreads = prev.map((thread) => (thread.id === threadId ? { ...thread, updated_at: newUpdatedAtString } : thread));
      return sortThreads(updatedThreads);
    });
  }, []);

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
      setThreadsHaveChanges({});
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


  const renameThread = useCallback(
    async (threadId: string, title: string) => {
      try {
        let thread = threads.find((thread) => thread.id === threadId);
        if (!thread?.is_from_local) {
          await updateThreadTitle({ threadId, title, projectId });
          setThreads((prev) =>
            prev.map((thread) => (thread.id === threadId ? { ...thread, title } : thread))
          );
          await refreshThreads();
          toast.success('Thread renamed successfully');
        } else {
          setThreads((prev) =>
            prev.map((thread) => (thread.id === threadId ? { ...thread, title } : thread))
          );
        }
        
      } catch (err: any) {
        toast.error('Failed to rename thread', {
          description: err.message,
        });
        throw err;
      }
    },
    [projectId, refreshThreads, threads]
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadApi(projectId, threadId);
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
        // Note: URL will need to be updated externally to clear threadId param
        toast.success('Thread deleted');
      } catch (err: any) {
        toast.error('Failed to delete thread', {
          description: err.message,
        });
      }
    },
    [projectId]
  );

  const deleteDraftThread = useCallback(
    (threadId: string) => {
      // Check if the deleted thread is currently selected
      const isSelectedThread = selectedThreadId === threadId;

      setThreads((prev) => {
        const newThreads = prev.filter((thread) => thread.id !== threadId);

        // If the deleted thread was selected, navigate to the first remaining thread
        if (isSelectedThread && newThreads.length > 0) {
          const firstThread = newThreads[0];
          const params = new URLSearchParams(searchParams);
          params.set('threadId', firstThread.id);
          navigate(`/chat?${params.toString()}`);
        } else if (isSelectedThread && newThreads.length === 0) {
          // If no threads remain, clear the threadId param
          const params = new URLSearchParams(searchParams);
          params.delete('threadId');
          navigate(`/chat?${params.toString()}`);
        }

        return newThreads;
      });
    },
    [selectedThreadId, searchParams, navigate]
  );

  const addThread = useCallback((thread: Thread) => {
    setThreads((prev) => [thread, ...prev]);
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

  const updateThreadCost = useCallback((threadId: string, cost: CostValueData) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? { 
            ...thread, 
            cost: cost.cost + (thread.cost ?? 0), 
            updated_at: new Date().toISOString(),
            input_tokens: (cost.usage?.input_tokens ?? 0) + (thread.input_tokens ?? 0),
            output_tokens: (cost.usage?.output_tokens ?? 0) + (thread.output_tokens ?? 0),
          }
          : thread
      )
    );
  }, []);

  const addThreadByEvent = useCallback((eventThread: ThreadEventValue, onThreadAdded?: (threadId: string, isNew: boolean) => void) => {
    let threadInfo = convertToThreadInfo(eventThread);
    let isNewThread = false;
    setThreads((prev) => {
      // Check if thread already exists
      const existingIndex = prev.findIndex(thread => thread.id === threadInfo.id);

      let updatedThreads: Thread[];
      if (existingIndex !== -1) {
        // Update existing thread
        updatedThreads = [...prev];
        const prevThread = prev[existingIndex];
        let updatedThread = {
          ...prevThread,
          ...threadInfo,
          input_models: threadInfo.input_models && threadInfo.input_models.length > 0 ? threadInfo.input_models : prevThread.input_models,
          model_name: threadInfo.model_name && threadInfo.model_name.length > 0 ? threadInfo.model_name : prevThread.model_name,
        };
        isNewThread = false;
        updatedThreads[existingIndex] = updatedThread;
      } else {
        // Add new thread
        updatedThreads = [threadInfo, ...prev];
        isNewThread = true;
      }

      const sortedThreads = sortThreads(updatedThreads);
      return sortedThreads;
    });

    // Call the callback after state update
    if (onThreadAdded) {
      onThreadAdded(threadInfo.id, isNewThread);
    }
  }, []);



  return {
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
    renameThread,
    deleteThread,
    deleteDraftThread,
    addThread,
    updateThread,
    addThreadByEvent,
    updateThreadCost,
    onThreadMessageHaveChanges,
    threadsHaveChanges,
    onThreadMessageCreated,
    onThreadModelStartEvent,
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
