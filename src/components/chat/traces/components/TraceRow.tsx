import React, { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { RunDTO } from "@/services/runs-api";
import { SummaryTraces } from "./Summary-row";
import { DetailedRunView } from "./detail-run-view";

interface TraceRowProps {
  run: RunDTO;
  index?: number;
  isInSidebar?: boolean;
}

// Component implementation
const TraceRowImpl = ({ run, index = 0, isInSidebar = false }: TraceRowProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const traceOrRunId = run.run_id || '';

  const toggleAccordion = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return (
    <motion.div
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

// Custom comparison function to prevent unnecessary re-renders
const arePropsEqual = (prevProps: TraceRowProps, nextProps: TraceRowProps) => {
  // Check primitive props first (fastest)
  if (prevProps.index !== nextProps.index ||
      prevProps.isInSidebar !== nextProps.isInSidebar) {
    return false;
  }

  // Check run efficiently
  const prevRun = prevProps.run;
  const nextRun = nextProps.run;
  if (prevRun?.run_id !== nextRun?.run_id) {
    return false;
  }

  return true;
};

// Export memoized component
export const TraceRow = React.memo(TraceRowImpl, arePropsEqual);
