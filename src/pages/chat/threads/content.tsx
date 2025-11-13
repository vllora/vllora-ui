import { useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from "react-router";
import { v4 as uuidv4 } from 'uuid';
import { ThreadsSidebar } from '@/components/chat/ThreadsSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ChatWindowProvider } from '@/contexts/ChatWindowContext';
import { Thread } from '@/types/chat';
import { ConversationAndTraces } from './conversation-and-traces';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { LoadingState } from '@/components/LoadingState';

export function ThreadsPageContent() {
  const { currentProjectId } = ProjectsConsumer();
  const [searchParams] = useSearchParams();
  const {
    threads,
    selectedThreadId,
    addThread,
    refreshThreads,
    setThreads,
    selectedThread,
    handleThreadClick,
    loading,
  } = ThreadsConsumer();
  // Read selectedModel from URL query string, fallback to default
  const selectedModel = useMemo(() => {
    return searchParams.get('model') || (selectedThread?.input_models && selectedThread.input_models.length > 0 ? selectedThread.input_models[selectedThread.input_models.length - 1] : undefined) || 'openai/gpt-4o-mini';
  }, [searchParams, selectedThread]);

  useEffect(() => {
    setThreads([]);
    refreshThreads();
  }, [currentProjectId]);

  const handleSelectThread = useCallback((threadId: string) => {
    const thread = threads.find((t) => t.thread_id === threadId);
    const inputModels = thread?.input_models || [];
    handleThreadClick(threadId, inputModels);
  }, [threads, handleThreadClick]);


  const handleNewThread = useCallback(() => {
    const now = Date.now() * 1000; // Convert to microseconds
    const newThreadId = uuidv4();

    const newThread: Thread = {
      thread_id: newThreadId,
      start_time_us: now,
      finish_time_us: now,
      run_ids: [],
      input_models: selectedModel ? [selectedModel] : [],
      cost: 0,
      is_from_local: true,
    };
    addThread(newThread);
    // Navigate to the new thread using handleThreadClick
    handleThreadClick(newThreadId, newThread.input_models);
  }, [selectedModel, addThread, handleThreadClick]);


  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      handleSelectThread(threads[0].thread_id);
      return;
    }
    if((!threads || threads.length === 0) && (searchParams.get('thread_id') || searchParams.get('model'))) {
      // remove param threads from url
      searchParams.delete('thread_id');
      searchParams.delete('model');
      // update url
      window.history.replaceState(null, '', `?${searchParams.toString()}`);
      return;
    }
  }, [selectedThreadId, threads, handleSelectThread, searchParams]);

  // Show loading state while threads are being fetched
  if (loading && threads.length === 0) {
    return <LoadingState message="Loading conversations" />;
  }

  // Show ChatEmptyState when no threads exist and not loading
  if (threads.length === 0) {
    return <ChatEmptyState onNewChat={handleNewThread} projectId={currentProjectId} />;
  }

  return (
    <section className="flex-1 flex bg-background text-foreground overflow-hidden" aria-label="Chat Interface">
      {/* Left Sidebar */}
      <ThreadsSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />

      {/* Main Chat Area and Right Sidebar */}
      {selectedThreadId && currentProjectId ? (
        <ChatWindowProvider threadId={selectedThreadId} projectId={currentProjectId} selectedModel={selectedModel}>
          <ConversationAndTraces />
        </ChatWindowProvider>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-muted-foreground mb-2">
              Select a conversation
            </h2>
            <p className="text-muted-foreground/70">
              Choose a thread from the sidebar to start chatting
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
