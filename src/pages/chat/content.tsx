import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ThreadsSidebar } from '@/components/chat/ThreadsSidebar';
import { ConversationWindow } from '@/components/chat/ConversationWindow';
import { TracesRightSidebar } from '@/components/chat/TracesRightSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ChatWindowProvider } from '@/contexts/ChatWindowContext';
import { Thread } from '@/types/chat';
import { API_CONFIG } from '@/config/api';
import { useThreadsEvents } from '@/hooks/events/useThreadsEvents';

export function ChatPage() {
  const { currentProjectId, isDefaultProject } = ProjectsConsumer();
  const [searchParams] = useSearchParams();
  const {
    threads,
    selectedThreadId,
    addThread,
    updateThread,
    refreshThreads
  } = ThreadsConsumer();
  const navigate = useNavigate();
  const location = useLocation();

  // Read selectedModel from URL query string, fallback to default
  const selectedModel = useMemo(() => {
    return searchParams.get('model') || 'openai/o1-mini';
  }, [searchParams]);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const handleSelectThread = useCallback((threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    // Navigate to update the threadId and model in URL
    const modelParam = thread?.model_name || selectedModel;
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

  // Subscribe to project events
  useThreadsEvents({
    currentProjectId: currentProjectId || '',
    currentThreadId: selectedThreadId || '',
    onSelectThread: handleSelectThread,
  });

  const handleNewThread = useCallback(() => {
    const newThread: Thread = {
      id: uuidv4(),
      model_name: selectedModel,
      project_id: currentProjectId || '',
      user_id: '', // TODO: Get from auth context
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_from_local: true,
    };
    addThread(newThread);
    // Navigate to the new thread with model in URL and project_id (only if not default)
    const params = new URLSearchParams(searchParams);
    params.set('threadId', newThread.id);
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
      updateThread(selectedThreadId, {
        model_name: modelId,
      });
    }
    if (currentProjectId && !isDefaultProject(currentProjectId)) {
      params.set('project_id', currentProjectId);
    } else {
      params.delete('project_id');
    }
    navigate(`/chat?${params.toString()}`);
  }, [selectedThreadId, searchParams, currentProjectId, updateThread, navigate, isDefaultProject]);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      handleSelectThread(threads[0].id);
    }
  }, [selectedThreadId, threads, handleSelectThread]);

  const handleProjectChange = useCallback((newProjectId: string) => {
    localStorage.setItem('currentProjectId', newProjectId);
    // Update the project_id query param while keeping current path (omit if default)
    const params = new URLSearchParams(searchParams);
    if (isDefaultProject(newProjectId)) {
      params.delete('project_id');
    } else {
      params.set('project_id', newProjectId);
    }
    const queryString = params.toString();
    navigate(`${location.pathname}${queryString ? '?' + queryString : ''}`);
  }, [location.pathname, navigate, searchParams, isDefaultProject]);

  return (
    <section className="flex-1 flex bg-background text-foreground overflow-hidden" aria-label="Chat Interface">
      {/* Left Sidebar */}
      <ThreadsSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onProjectChange={handleProjectChange}
      />

      {/* Main Chat Area and Right Sidebar */}
      {selectedThreadId && currentProjectId ? (
        <ChatWindowProvider threadId={selectedThreadId} projectId={currentProjectId}>
          <div className="flex-1 flex flex-col overflow-hidden">
            <ConversationWindow
              threadId={selectedThreadId}
              threadTitle={threads.find((t) => t.id === selectedThreadId)?.title}
              modelName={selectedModel}
              apiUrl={API_CONFIG.url}
              projectId={currentProjectId}
              widgetId={`chat-${selectedThreadId}`}
              onModelChange={handleModelChange}
              isDraft={threads.find((t) => t.id === selectedThreadId)?.is_from_local}
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