import React, { useCallback } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { RunDTO } from "@/services/runs-api";
import { SummaryTraces } from "./Summary-row";
import { DetailedRunView } from "./detail-run-view";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

interface TraceRowProps {
  run: RunDTO;
  index?: number;
  isInSidebar?: boolean;
}

// Component implementation
const TraceRowImpl = ({ run, index = 0, isInSidebar = false }: TraceRowProps) => {
  const { openTraces, setOpenTraces, fetchSpansByRunId } = ChatWindowConsumer();
  const traceOrRunId = run.run_id || '';
  const isOpen = openTraces.includes(traceOrRunId);
  const toggleAccordion = useCallback(() => {
    setOpenTraces(prev => {
      const isCurrentlyOpen = prev.includes(traceOrRunId);
      if (isCurrentlyOpen) {
        // Close the trace
        return [];
      } else {
        // Open the trace and fetch spans as a side effect (outside state setter)
        // We'll use setTimeout to ensure state update happens first
        setTimeout(() => {
          fetchSpansByRunId(traceOrRunId);
        }, 0);
        return [traceOrRunId];
      }
    });
  }, [traceOrRunId, setOpenTraces, fetchSpansByRunId]);
  return (<motion.div
    className={cn(
      "shadow-sm transition-all border-border border-b-none",
      isOpen ? "shadow-md" : "hover:shadow-md",
      isInSidebar ? 'rounded-md' : 'rounded-none',
      isInSidebar && isOpen ? "" : "overflow-hidden"
    )}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.1) }}
    data-testid={`trace-row-${traceOrRunId}`}
    data-run-id={traceOrRunId}
  >
    <SummaryTraces
      run={run}
      isOpen={isOpen}
      onChevronClick={toggleAccordion}
      isInSidebar={isInSidebar}
    />
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id={`trace-details-${traceOrRunId}`}
          className={cn(
            'overflow-hidden border-border',
          )}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className={cn(
            "overflow-auto custom-scrollbar",
          )}>
            <DetailedRunView run={run} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
  );
};

// Export memoized component
export const TraceRow = React.memo(TraceRowImpl);
