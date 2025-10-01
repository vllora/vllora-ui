import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ChatPageSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatRightSidebar } from '@/components/chat/ChatRightSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ChatWindowProvider } from '@/contexts/ChatWindowContext';
import { Thread } from '@/types/chat';
import { API_CONFIG } from '@/config/api';

export function ChatPage() {
  const { currentProjectId } = ProjectsConsumer();
  const { projectId } = useParams<{ projectId: string }>();
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
  const [traces, setTraces] = useState<any[]>([]);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const handleNewThread = useCallback(() => {
    const newThread: Thread = {
      id: `thread-${Date.now()}`,
      title: 'New conversation',
      model_name: selectedModel,
      project_id: currentProjectId || '',
      user_id: '', // TODO: Get from auth context
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addThread(newThread);
    // Navigate to the new thread with model in URL
    navigate(`/projects/${projectId}/chat?threadId=${newThread.id}&model=${selectedModel}`);
  }, [selectedModel, currentProjectId, projectId, addThread, navigate]);

  const handleSelectThread = useCallback((threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    // Navigate to update the threadId and model in URL
    const modelParam = thread?.model_name || selectedModel;
    navigate(`/projects/${projectId}/chat?threadId=${threadId}&model=${modelParam}`);
  }, [projectId, threads, selectedModel, navigate]);


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
    navigate(`/projects/${projectId}/chat?${params.toString()}`);
  }, [selectedThreadId, searchParams, projectId, updateThread, navigate]);

  const handleProjectChange = useCallback((newProjectId: string) => {
    localStorage.setItem('currentProjectId', newProjectId);
    const currentPath = location.pathname.split('/').slice(3).join('/') || '';
    navigate(`/project/${newProjectId}${currentPath ? '/' + currentPath : ''}`);
  }, [location.pathname, navigate]);

  return (
    <section className="flex-1 flex bg-background text-foreground overflow-hidden" aria-label="Chat Interface">
      {/* Left Sidebar */}
      <ChatPageSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onProjectChange={handleProjectChange}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedThreadId && projectId ? (
          <ChatWindowProvider threadId={selectedThreadId} projectId={projectId}>
            <ChatWindow
              threadId={selectedThreadId}
              modelName={selectedModel}
              apiUrl={API_CONFIG.url}
              // apiKey={API_CONFIG.apiKey}
              projectId={currentProjectId}
              widgetId={`chat-${selectedThreadId}`}
              onModelChange={handleModelChange}
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
      </div>

      {/* Right Sidebar - Traces */}
      {selectedThreadId && (
        <ChatRightSidebar
          threadId={selectedThreadId}
          traces={traces}
          isCollapsed={isRightSidebarCollapsed}
          onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
        />
      )}
    </section>
  );
}