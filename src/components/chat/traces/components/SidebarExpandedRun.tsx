import React, { useCallback, useMemo } from 'react';
import { SummaryTraces } from './Summary-row';
import { DetailedRunView } from './detail-run-view';
import { TraceCodeView } from './TraceCodeView';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

interface SidebarExpandedRunProps {
 
}

/**
 * Special component for sidebar expanded mode - renders a single run
 * with sticky header for better UX when viewing trace details
 */
export const SidebarExpandedRun: React.FC<SidebarExpandedRunProps> = ({

}) => {
  const { setOpenTraces, openTraces, runs } = ChatWindowConsumer();


  const currentRunId: string = useMemo(()=> {
    return openTraces && openTraces.length && openTraces[0] ? openTraces[0].run_id : ''
  }, [openTraces])

  const currentTab: 'trace' | 'code' = useMemo(()=> {
    return openTraces && openTraces.length && openTraces[0] ? openTraces[0].tab : 'trace'
  }, [openTraces])
  const isOpen = openTraces.some(t => t.run_id === currentRunId);

  const toggleAccordion = useCallback(() => {
    setOpenTraces(prev => {
      const existingIndex = prev.findIndex(t => t.run_id === currentRunId);
      if (existingIndex !== -1) {
        return [];
      } else {
        return [{ run_id: currentRunId, tab: 'trace' }];
      }
    });
  }, [setOpenTraces, currentRunId]);

  const run = runs.find(r => r.run_id === currentRunId);

  if (!run) {
    return null;
  }

  return (
    <div key={`SidebarExpandedRun-${currentRunId}-${isOpen}`} className="h-full flex flex-col">
      {/* Sticky Header */}
      {currentTab === 'trace' && <div className="sticky top-0 z-10 bg-background border-b border-border">
        <SummaryTraces
          run={run}
          isOpen={isOpen}
          isInSidebar={true}
          onChevronClick={toggleAccordion}
        />
      </div>}

      {/* Scrollable Content */}
      {isOpen && (
        <div className="flex-1 overflow-auto">
          {currentTab === 'trace' ? (
            <DetailedRunView run={run} />
          ) : (
            <TraceCodeView runId={currentRunId} />
          )}
        </div>
      )}
    </div>
  );
};
