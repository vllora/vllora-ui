import React from 'react';
import { Trash2 } from 'lucide-react';
import { Thread } from '@/types/chat';

interface ThreadListProps {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onDeleteThread,
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (threads.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No conversations yet. Start a new chat!
      </div>
    );
  }

  return (
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
                {formatDate(thread.updated_at)}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {thread.model_name}
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
  );
};
