
export interface ThreadChanges {
  [threadId: string]: {
    messages: {
      message_id: string;
      status: 'start' | 'streaming' | 'end';
      timestamp: number;
    }[];
  };
}



export interface ThreadPaginationState {
  offset: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadingThreadsError: string | null;
}

export interface ThreadChangesState {
  threadsHaveChanges: ThreadChanges;
  setThreadsHaveChanges: React.Dispatch<React.SetStateAction<ThreadChanges>>;
}
