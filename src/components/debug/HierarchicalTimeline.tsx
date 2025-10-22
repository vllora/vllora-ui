import React from 'react';
import { DebugThread } from '@/hooks/events/useDebugTimeline';
import { ThreadItem } from './ThreadItem';

interface HierarchicalTimelineProps {
  threads: DebugThread[];
}

// Main Timeline Component
export const HierarchicalTimeline: React.FC<HierarchicalTimelineProps> = ({ threads }) => {
  if (threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">No threads to display</p>
          <p className="text-sm mt-1">Waiting for activity...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
        Showing {threads.length} thread{threads.length !== 1 ? 's' : ''}
      </div>
      <div className="flex-1">
        {threads.map((thread, index) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            defaultExpanded={index === threads.length - 1}
          />
        ))}
      </div>
    </div>
  );
};
