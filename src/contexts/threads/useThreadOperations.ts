import { useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Thread } from '@/types/chat';
import { updateThreadTitle, deleteThread as deleteThreadApi } from '@/services/threads-api';
import { CostValueData, ThreadEventValue } from '../project-events/dto';
import { convertToThreadInfo } from '../project-events/util';
import { ThreadState } from './types';
import { sortThreads } from './utils';

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
    [projectId, refreshThreads, threads, setThreads]
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadApi(projectId, threadId);
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
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
          thread.id === threadId
            ? { ...thread, ...updates, updated_at: new Date().toISOString() }
            : thread
        )
      );
    },
    [setThreads]
  );

  const updateThreadCost = useCallback(
    (threadId: string, cost: CostValueData) => {
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
    },
    [setThreads]
  );

  const addThreadByEvent = useCallback(
    (eventThread: ThreadEventValue, onThreadAdded?: (threadId: string, isNew: boolean) => void) => {
      let threadInfo = convertToThreadInfo(eventThread);
      let isNewThread = false;
      setThreads((prev) => {
        // Check if thread already exists
        const existingIndex = prev.findIndex((thread) => thread.id === threadInfo.id);

        let updatedThreads: Thread[];
        if (existingIndex !== -1) {
          // Update existing thread
          updatedThreads = [...prev];
          const prevThread = prev[existingIndex];
          let updatedThread = {
            ...prevThread,
            ...threadInfo,
            input_models:
              threadInfo.input_models && threadInfo.input_models.length > 0
                ? threadInfo.input_models
                : prevThread.input_models,
            model_name:
              threadInfo.model_name && threadInfo.model_name.length > 0
                ? threadInfo.model_name
                : prevThread.model_name,
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
    },
    [setThreads]
  );

  return {
    renameThread,
    deleteThread,
    deleteDraftThread,
    addThread,
    updateThread,
    updateThreadCost,
    addThreadByEvent,
  };
}
