import { useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ThreadsSidebar } from '@/components/chat/ThreadsSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ChatWindowProvider } from '@/contexts/ChatWindowContext';
import { Thread } from '@/types/chat';
import { ConversationAndTraces } from './conversation-and-traces';

export function ThreadsPageContent() {
  const { currentProjectId, isDefaultProject } = ProjectsConsumer();
  const [searchParams] = useSearchParams();
  const {
    threads,
    selectedThreadId,
    addThread,
    refreshThreads,
    selectedThread,
  } = ThreadsConsumer();
  const navigate = useNavigate();
  // Read selectedModel from URL query string, fallback to default
  const selectedModel = useMemo(() => {
    return searchParams.get('model') || (selectedThread?.input_models && selectedThread.input_models.length > 0 ? selectedThread.input_models[selectedThread.input_models.length - 1] : undefined) || 'openai/gpt-4.1-nano';
  }, [searchParams, selectedThread]);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const handleSelectThread = useCallback((threadId: string) => {
    const thread = threads.find((t) => t.thread_id === threadId);
    // Navigate to update the threadId and model in URL
    const modelParam = thread?.input_models && thread.input_models.length > 0 ? thread.input_models[thread.input_models.length - 1] : selectedModel;
    const params = new URLSearchParams(searchParams);
    params.set('threadId', threadId);
    params.set('model', modelParam);
    if (currentProjectId && !isDefaultProject(currentProjectId)) {
      params.set('project_id', currentProjectId);
    } else {
      params.delete('project_id');
    }
    navigate(`/chat?${params.toString()}`);
  }, [threads, selectedModel, navigate, searchParams, currentProjectId, isDefaultProject]);


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
    // Navigate to the new thread with model in URL and project_id (only if not default)
    const params = new URLSearchParams(searchParams);
    params.set('threadId', newThread.thread_id);
    params.set('model', selectedModel);
    if (currentProjectId && !isDefaultProject(currentProjectId)) {
      params.set('project_id', currentProjectId);
    } else {
      params.delete('project_id');
    }
    navigate(`/chat?${params.toString()}`);
  }, [selectedModel, currentProjectId, addThread, navigate, searchParams, isDefaultProject]);


  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      handleSelectThread(threads[0].thread_id);
    }
  }, [selectedThreadId, threads, handleSelectThread]);


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
              Choose a thread from the sidebar or start a new chat
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
