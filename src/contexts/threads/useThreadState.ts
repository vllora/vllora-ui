import { useState, useMemo } from 'react';
import { useSearchParams } from "react-router";
import { Thread } from '@/types/chat';

export function useThreadState() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [searchParams] = useSearchParams();
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  // Read selectedThreadId from URL query string
  const selectedThreadId = useMemo(() => {
    return searchParams.get('threadId');
  }, [searchParams]);

  const selectedThread = useMemo(() => {
    return threads.find((thread) => thread.thread_id === selectedThreadId);
  }, [threads, selectedThreadId]);

  return {
    threads,
    setThreads,
    selectedThreadId,
    isRightSidebarCollapsed,
    setIsRightSidebarCollapsed,
    selectedThread,
  };
}
export type ThreadState = ReturnType<typeof useThreadState>;
