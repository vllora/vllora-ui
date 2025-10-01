import { createContext, useContext, ReactNode, useCallback, useState } from 'react';
import { useRequest, useLatest } from 'ahooks';
import { toast } from 'sonner';
import { queryMessages } from '@/services/messages-api';
import { listRuns, RunDTO } from '@/services/runs-api';
import { Message } from '@/types/chat';

interface ChatWindowContextType {
  messages: Message[];
  isLoading: boolean;
  error: Error | undefined;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  refreshMessages: () => void;
  runs: RunDTO[];
  runsLoading: boolean;
  runsError: Error | undefined;
  refreshRuns: () => void;
  loadMoreRuns: () => Promise<void>;
  hasMoreRuns: boolean;
  runsTotal: number;
  loadingMoreRuns: boolean;
}


const ChatWindowContext = createContext<ChatWindowContextType | undefined>(undefined);

interface ChatWindowProviderProps {
  children: ReactNode;
  threadId: string;
  projectId: string;
}

const LIMIT_LOADING_RUNS = 20;

export function ChatWindowProvider({ children, threadId, projectId }: ChatWindowProviderProps) {
  // Pagination state for runs
  const [runsOffset, setRunsOffset] = useState<number>(0);
  const [runsTotal, setRunsTotal] = useState<number>(0);
  const [hasMoreRuns, setHasMoreRuns] = useState<boolean>(false);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState<boolean>(false);
  const [rawRuns, setRawRuns] = useState<RunDTO[]>([]);

  const threadIdRef = useLatest(threadId);
  const projectIdRef = useLatest(projectId);

  // Use ahooks useRequest for fetching messages
  const { data, loading: isLoading, error, run: refreshMessages } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return [];
      }
      const response = await queryMessages(projectId, threadId, {
        order_by: [['created_at', 'asc']],
        limit: 100,
        offset: 0,
      });
      return response;
    },
    {
      refreshDeps: [threadId, projectId],
      onError: (err) => {
        toast.error('Failed to load messages', {
          description: err.message || 'An error occurred while loading messages',
        });
      },
      onSuccess: (response) => {
        console.log('ChatWindowContext: Messages loaded successfully', response);
      },
    }
  );

  // Use ahooks useRequest for fetching runs of this thread (initial load)
  const {
    loading: runsLoading,
    error: runsError,
    run: triggerRefreshRuns,
  } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return { data: [], pagination: { offset: 0, limit: 0, total: 0 } };
      }
      const response = await listRuns({
        projectId,
        params: {
          threadIds: threadId, // Comma-separated string
          limit: LIMIT_LOADING_RUNS,
          offset: 0,
        },
      });
      console.log('ChatWindowContext: Fetched runs', response);

      // Update pagination state
      const runs = response?.data || [];
      const pagination = response?.pagination || { offset: 0, limit: 0, total: 0 };

      const newOffset = runs.length;
      const newHasMore = pagination.total > runs.length;

      setRunsTotal(pagination.total);
      setRunsOffset(newOffset);
      setHasMoreRuns(newHasMore);
      setRawRuns(runs);

      return response;
    },
    {
      refreshDeps: [threadId, projectId],
      onError: (err) => {
        toast.error('Failed to load runs', {
          description: err.message || 'An error occurred while loading runs',
        });
      },
      onSuccess: (response) => {
        console.log('ChatWindowContext: Runs loaded successfully', response);
      },
    }
  );

  // Load more runs function
  const loadMoreRuns = useCallback(async () => {
    if (runsLoading || loadingMoreRuns || !hasMoreRuns || runsOffset === 0) return;

    setLoadingMoreRuns(true);
    try {
      const response = await listRuns({
        projectId: projectIdRef.current,
        params: {
          threadIds: threadIdRef.current,
          limit: LIMIT_LOADING_RUNS,
          offset: runsOffset,
        },
      });

      const runs = response?.data || [];
      const pagination = response?.pagination || { offset: 0, limit: 0, total: 0 };

      // Update pagination state
      const newOffset = runsOffset + runs.length;
      const newHasMore = pagination.total > newOffset;

      setRunsTotal(pagination.total);
      setRunsOffset(newOffset);
      setHasMoreRuns(newHasMore);
      setRawRuns((prev) => [...prev, ...runs]);
    } catch (err: any) {
      toast.error('Failed to load more runs', {
        description: err.message || 'An error occurred while loading more runs',
      });
    } finally {
      setLoadingMoreRuns(false);
    }
  }, [runsLoading, loadingMoreRuns, hasMoreRuns, runsOffset, threadIdRef, projectIdRef]);

  // Refresh runs function (reset and reload from beginning)
  const refreshRuns = useCallback(() => {
    setRunsOffset(0);
    setRunsTotal(0);
    setHasMoreRuns(false);
    setRawRuns([]);
    triggerRefreshRuns();
  }, [triggerRefreshRuns]);

  // Map API messages to local Message type
  const messages = data || [];
  const runs = rawRuns;

  const addMessage = useCallback((_message: Message) => {
    // TODO: Implement optimistic message adding if needed
  }, []);

  const clearMessages = useCallback(() => {
    // Clear messages by refreshing with empty result
    refreshMessages();
  }, [refreshMessages]);

  const value: ChatWindowContextType = {
    messages,
    isLoading,
    error,
    addMessage,
    clearMessages,
    refreshMessages,
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    runsTotal,
    loadingMoreRuns,
  };

  return <ChatWindowContext.Provider value={value}>{children}</ChatWindowContext.Provider>;
}

export function ChatWindowConsumer() {
  const context = useContext(ChatWindowContext);
  if (context === undefined) {
    throw new Error('ChatWindowConsumer must be used within a ChatWindowProvider');
  }
  return context;
}
