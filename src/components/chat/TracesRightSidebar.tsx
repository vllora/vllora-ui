'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TraceView } from './traces/TraceView';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useTraceEvents } from '@/hooks/events/useTraceEvents';

const TRACE_PANEL_WIDTH = 450;
const CONTROL_PANEL_WIDTH = 40;

interface TracesRightSidebarProps {
  threadId: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export const TracesRightSidebar: React.FC<TracesRightSidebarProps> = ({
  threadId,
  isCollapsed = false,
  onToggle,
}) => {
  const isOpen = !isCollapsed;
  const {currentProjectId} = ProjectsConsumer();
  useTraceEvents({
    currentProjectId: currentProjectId || '',
    currentThreadId: threadId,
  });
  return (
    <div className="flex h-full">
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: TRACE_PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="h-full backdrop-blur supports-[backdrop-filter]:bg-background/60"
          >
            <div style={{ width: TRACE_PANEL_WIDTH }} className="h-full">
              <TraceView threadId={threadId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{ width: CONTROL_PANEL_WIDTH }}
        className="h-full flex flex-col items-center justify-start py-2 border-l border-border bg-background"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="hover:bg-accent transition-all duration-200 flex-shrink-0"
        >
          {isCollapsed ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
