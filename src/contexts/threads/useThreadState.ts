import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Thread } from '@/types/chat';
import { ThreadState } from './types';

export function useThreadState(): ThreadState {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [searchParams] = useSearchParams();

  // Read selectedThreadId from URL query string
  const selectedThreadId = useMemo(() => {
    return searchParams.get('threadId');
  }, [searchParams]);

  return {
    threads,
    setThreads,
    selectedThreadId,
  };
}
