import React from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Thread } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { ProjectDropdown } from '@/components/ProjectDropdown';
import { ThreadList } from './thread/ThreadList';

interface ChatSidebarProps {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onProjectChange?: (projectId: string) => void;
}

export const ThreadsSidebar: React.FC<ChatSidebarProps> = ({
  threads,
  onNewThread,
  onProjectChange,
}) => {
  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Project Dropdown Header */}
      <div className="h-16 px-4 border-b border-border flex items-center bg-card/95 backdrop-blur-xl">
        <ProjectDropdown onProjectChange={onProjectChange} />
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-b border-border flex items-center">
        <Button
          onClick={onNewThread}
          variant="outline"
          className="w-full text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))] hover:bg-[rgba(var(--theme-500),0.1)] font-medium"
        >
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        <ThreadList threads={threads} />
      </div>
    </div>
  );
};