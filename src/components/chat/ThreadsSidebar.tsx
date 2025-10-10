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

  console.log('===== threads', threads)
  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Project Dropdown Header */}
      <div className="h-16 px-4 border-b border-border flex items-center bg-card/95 backdrop-blur-xl">
        <ProjectDropdown onProjectChange={onProjectChange} />
      </div>

      {/* New Chat Button */}
      <div className="px-4 h-16 border-b border-border flex items-center">
        <Button
          onClick={onNewThread}
          className="w-full bg-gradient-to-r from-[rgb(var(--theme-600))] to-[rgb(var(--theme-500))] hover:from-[rgb(var(--theme-700))] hover:to-[rgb(var(--theme-600))] text-white font-semibold shadow-sm hover:shadow-md transition-all duration-200"
        >
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-hidden">
        <ThreadList threads={threads} />
      </div>
    </div>
  );
};