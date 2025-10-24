import { useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Thread } from '@/types/chat';
import { updateThreadTitle, deleteThread as deleteThreadApi } from '@/services/threads-api';
import { ThreadState } from './types';

export function useThreadOperations(
  projectId: string,
  threadState: ThreadState,
  refreshThreads: () => Promise<void>
) {
  const { threads, setThreads, selectedThreadId } = threadState;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const renameThread = useCallback(
    async (threadId: string, title: string) => {
      try {
        let thread = threads.find((thread) => thread.thread_id === threadId);
        if (!thread?.is_from_local) {
          await updateThreadTitle({ threadId, title, projectId });
          setThreads((prev) =>
            prev.map((thread) => (thread.thread_id === threadId ? { ...thread, title } : thread))
          );
          await refreshThreads();
          toast.success('Thread renamed successfully');
        } else {
          setThreads((prev) =>
            prev.map((thread) => (thread.thread_id === threadId ? { ...thread, title } : thread))
          );
        }
      } catch (err: any) {
        toast.error('Failed to rename thread', {
          description: err.message,
        });
        throw err;
      }
    },
    [projectId, refreshThreads, threads, setThreads]
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadApi(projectId, threadId);
        setThreads((prev) => prev.filter((thread) => thread.thread_id !== threadId));
        toast.success('Thread deleted');
      } catch (err: any) {
        toast.error('Failed to delete thread', {
          description: err.message,
        });
      }
    },
    [projectId, setThreads]
  );

  const deleteDraftThread = useCallback(
    (threadId: string) => {
      // Check if the deleted thread is currently selected
      const isSelectedThread = selectedThreadId === threadId;

      setThreads((prev) => {
        const newThreads = prev.filter((thread) => thread.thread_id !== threadId);

        // If the deleted thread was selected, navigate to the first remaining thread
        if (isSelectedThread && newThreads.length > 0) {
          const firstThread = newThreads[0];
          const params = new URLSearchParams(searchParams);
          params.set('threadId', firstThread.thread_id);
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
    [selectedThreadId, searchParams, navigate, setThreads]
  );

  const addThread = useCallback(
    (thread: Thread) => {
      setThreads((prev) => [thread, ...prev]);
    },
    [setThreads]
  );

  const updateThread = useCallback(
    (threadId: string, updates: Partial<Thread>) => {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.thread_id === threadId
            ? { ...thread, ...updates, updated_at: new Date().toISOString() }
            : thread
        )
      );
    },
    [setThreads]
  );


  return {
    renameThread,
    deleteThread,
    deleteDraftThread,
    addThread,
    updateThread,
  };
}
