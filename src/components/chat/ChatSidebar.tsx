import React from 'react';
import { MessageSquarePlus, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { Thread } from '@/types/chat';
import { Button } from '@/components/ui/button';

interface ChatSidebarProps {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
}

export const ChatPageSidebar: React.FC<ChatSidebarProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <Button
          onClick={onNewThread}
          className="w-full"
        >
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No conversations yet. Start a new chat!
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedThreadId === thread.id
                    ? 'bg-accent border border-border'
                    : 'hover:bg-accent/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-card-foreground truncate mb-1">
                      {thread.title || 'New conversation'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(thread.updatedAt)}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {thread.model}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThread(thread.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};