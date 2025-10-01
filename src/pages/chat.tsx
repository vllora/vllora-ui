import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatPageSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatRightSidebar } from '@/components/chat/ChatRightSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { Thread } from '@/types/chat';
import { API_CONFIG } from '@/config/api';

export function ChatPage() {
  const { currentProjectId } = ProjectsConsumer();
  const {
    threads,
    selectedThreadId,
    selectThread,
    addThread,
    updateThread,
    refreshThreads
  } = ThreadsConsumer();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedModel, setSelectedModel] = useState<string>('openai/o1-mini');
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
    selectThread(newThread.id);
  }, [selectedModel, currentProjectId, addThread, selectThread]);

  const handleSelectThread = useCallback((threadId: string) => {
    selectThread(threadId);
    const thread = threads.find((t) => t.id === threadId);
    if (thread) {
      setSelectedModel(thread.model_name);
    }
  }, [selectThread, threads]);


  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    if (selectedThreadId) {
      updateThread(selectedThreadId, {
        model_name: modelId,
      });
    }
  }, [selectedThreadId, updateThread]);

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
        {selectedThreadId ? (
          <ChatWindow
            threadId={selectedThreadId}
            modelName={selectedModel}
            apiUrl={API_CONFIG.url}
            // apiKey={API_CONFIG.apiKey}
            projectId={currentProjectId}
            widgetId={`chat-${selectedThreadId}`}
            onModelChange={handleModelChange}
          />
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