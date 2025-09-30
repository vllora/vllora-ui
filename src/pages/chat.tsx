import { useState } from 'react';
import { ChatPageSidebar } from '@/components/chat/ChatSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { Thread, Message } from '@/types/chat';

export function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  const handleNewThread = () => {
    const newThread: Thread = {
      id: `thread-${Date.now()}`,
      title: '',
      model: 'gpt-4',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setThreads([newThread, ...threads]);
    setSelectedThreadId(newThread.id);
  };

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
  };

  const handleDeleteThread = (threadId: string) => {
    setThreads(threads.filter((t) => t.id !== threadId));
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
  };

  const handleModelChange = (modelId: string) => {
    if (!selectedThreadId) return;

    setThreads(
      threads.map((t) =>
        t.id === selectedThreadId
          ? {
              ...t,
              model: modelId,
              updatedAt: Date.now(),
            }
          : t
      )
    );
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedThreadId) {
      // Create new thread if none selected
      handleNewThread();
      return;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Add user message
    setThreads(
      threads.map((t) =>
        t.id === selectedThreadId
          ? {
              ...t,
              messages: [...t.messages, userMessage],
              title: t.title || content.slice(0, 50),
              updatedAt: Date.now(),
            }
          : t
      )
    );

    setIsLoading(true);

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'This is a simulated response. Connect to your LLM API to get real responses.',
        timestamp: Date.now(),
      };

      setThreads(
        threads.map((t) =>
          t.id === selectedThreadId
            ? {
                ...t,
                messages: [...t.messages, userMessage, assistantMessage],
                updatedAt: Date.now(),
              }
            : t
        )
      );
      setIsLoading(false);
    }, 1000);
  };

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
        {selectedThread ? (
          <ChatWindow
            thread={selectedThread}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
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