import { useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ThreadsSidebar } from '@/components/chat/ThreadsSidebar';
import { ConversationWindow } from '@/components/chat/conversation/ConversationWindow';
import { TracesRightSidebar } from '@/components/chat/TracesRightSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ChatWindowProvider } from '@/contexts/ChatWindowContext';
import { Thread } from '@/types/chat';

export function ThreadsPageContent() {
  const { currentProjectId, isDefaultProject } = ProjectsConsumer();
  const [searchParams] = useSearchParams();
  const {
    threads,
    selectedThreadId,
    addThread,
    updateThread,
    refreshThreads,
    loading,
    loadingThreadsError,
    isRightSidebarCollapsed,
    setIsRightSidebarCollapsed
  } = ThreadsConsumer();
  const navigate = useNavigate();

  const currentThread = useMemo(() => {
    return threads.find((t) => t.thread_id === selectedThreadId);
  }, [threads, selectedThreadId]);
  // Read selectedModel from URL query string, fallback to default
  const selectedModel = useMemo(() => {
    return searchParams.get('model') || (currentThread?.input_models && currentThread.input_models.length > 0 ? currentThread.input_models[currentThread.input_models.length - 1] : undefined) || 'openai/o1-mini';
  }, [searchParams, currentThread]);

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

  const handleModelChange = useCallback((modelId: string) => {
    // Update URL with new model
    const params = new URLSearchParams(searchParams);
    params.set('model', modelId);
    if (selectedThreadId) {
      params.set('threadId', selectedThreadId);
      // Update the thread's input_models
      const thread = threads.find((t) => t.thread_id === selectedThreadId);
      if (thread) {
        const updatedModels = thread.input_models.includes(modelId)
          ? thread.input_models
          : thread.is_from_local ? [modelId] : [...thread.input_models, modelId];
        updateThread(selectedThreadId, {
          input_models: updatedModels,
        });
      }
    }
    if (currentProjectId && !isDefaultProject(currentProjectId)) {
      params.set('project_id', currentProjectId);
    } else {
      params.delete('project_id');
    }
    navigate(`/chat?${params.toString()}`);
  }, [selectedThreadId, threads, searchParams, currentProjectId, updateThread, navigate, isDefaultProject]);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      handleSelectThread(threads[0].thread_id);
    }
  }, [selectedThreadId, threads, handleSelectThread]);

  // Auto-create a new thread when threads list is empty after loading
  useEffect(() => {
    if (!loading && !loadingThreadsError && threads.length === 0) {
      handleNewThread();
    }
  }, [loading, loadingThreadsError, threads.length, handleNewThread]);



  const isCurrentThreadDraft = useMemo(() => {
    if (threads && threads.length > 0) {
      const thread = threads.find((t) => t.thread_id === selectedThreadId);
      if (thread) {
        return thread.is_from_local
      }
      return true;
    }
    return true;
  }, [threads, selectedThreadId])

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
          <div className="flex-1 flex flex-col overflow-hidden">
            <ConversationWindow
              threadId={selectedThreadId}
              threadTitle={threads.find((t) => t.thread_id === selectedThreadId)?.title}
              projectId={currentProjectId}
              widgetId={`chat-${selectedThreadId}`}
              onModelChange={handleModelChange}
              isDraft={isCurrentThreadDraft}
            />
          </div>

          {/* Right Sidebar - Traces */}
          <TracesRightSidebar
            threadId={selectedThreadId}
            isCollapsed={isRightSidebarCollapsed}
            onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
          />
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