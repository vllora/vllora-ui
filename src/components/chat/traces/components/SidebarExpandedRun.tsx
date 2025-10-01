import React, { useCallback } from 'react';
import { SummaryTraces } from './Summary-row';
import { DetailedRunView } from './detail-run-view';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

interface SidebarExpandedRunProps {
  runId: string;
}

/**
 * Special component for sidebar expanded mode - renders a single run
 * with sticky header for better UX when viewing trace details
 */
export const SidebarExpandedRun: React.FC<SidebarExpandedRunProps> = ({
  runId,
}) => {
  const { setOpenTraces, openTraces, runs } = ChatWindowConsumer();

  const toggleAccordion = useCallback(() => {
    setOpenTraces(prev => {
      if (prev.includes(runId)) {
        return [];
      } else {
        return [runId];
      }
    });
  }, [setOpenTraces, runId]);

  const isOpen = openTraces.includes(runId);
  const run = runs.find(r => r.run_id === runId);

  if (!run) {
    return null;
  }

  return (
    <div key={`SidebarExpandedRun-${runId}-${isOpen}`} className="h-full flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <SummaryTraces
          run={run}
          isOpen={isOpen}
          isInSidebar={true}
          onChevronClick={toggleAccordion}
        />
      </div>

      {/* Scrollable Content */}
      {isOpen && (
        <div className="flex-1 overflow-auto">
          <DetailedRunView run={run} />
        </div>
      )}
    </div>
  );
};
