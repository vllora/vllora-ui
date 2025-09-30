import { useState, useCallback } from 'react';
import { ChatPageSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { Thread } from '@/types/chat';
import { API_CONFIG } from '@/config/api';

export function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('openai/o1-mini');

  const handleNewThread = useCallback(() => {
    const newThread: Thread = {
      id: `thread-${Date.now()}`,
      title: 'New conversation',
      model: selectedModel,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setThreads((prev) => [newThread, ...prev]);
    setSelectedThreadId(newThread.id);
  }, [selectedModel]);

  const handleSelectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
    setThreads((prev) => {
      const thread = prev.find((t) => t.id === threadId);
      if (thread) {
        setSelectedModel(thread.model);
      }
      return prev;
    });
  }, []);

  const handleDeleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setSelectedThreadId((prevId) => (prevId === threadId ? null : prevId));
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    setSelectedThreadId((currentThreadId) => {
      if (currentThreadId) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === currentThreadId
              ? {
                  ...t,
                  model: modelId,
                  updatedAt: Date.now(),
                }
              : t
          )
        );
      }
      return currentThreadId;
    });
  }, []);

  return (
    <section className="flex-1 flex bg-background text-foreground overflow-hidden" aria-label="Chat Interface">
      {/* Sidebar */}
      <ChatPageSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedThreadId ? (
          <ChatWindow
            threadId={selectedThreadId}
            modelName={selectedModel}
            apiUrl={API_CONFIG.url}
            apiKey={API_CONFIG.apiKey}
            projectId={API_CONFIG.projectId}
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
    </section>
  );
}