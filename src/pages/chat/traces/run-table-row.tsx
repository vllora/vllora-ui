import React, { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { RunDTO } from "@/types/common-type";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { DetailedRunViewWrapper } from "./detailed-run-view-wrapper";
import {
  ExclamationTriangleIcon,
  ClockIcon as ClockIconHero,
} from "@heroicons/react/24/outline";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { formatCost } from "@/utils/formatCost";
import { formatMessageTime } from "@/utils/dateUtils";
import { useRelativeTime } from "@/hooks/useRelativeTime";

interface RunTableRowProps {
  run: RunDTO;
  index?: number;
}

export const RunTableRow: React.FC<RunTableRowProps> = ({ run, index = 0 }) => {
  const { openTraces, setOpenTraces, fetchSpansByRunId, setSelectedSpanId, setDetailSpanId } = TracesPageConsumer();
  const runId = run.run_id || '';
  const isOpen = openTraces.some(t => t.run_id === runId);

  const toggleAccordion = useCallback(() => {
    setOpenTraces(prev => {
      const isCurrentlyOpen = prev.some(t => t.run_id === runId);
      if (isCurrentlyOpen) {
        return [];
      } else {
        setTimeout(() => {
          fetchSpansByRunId(runId);
        }, 0);
        return [{ run_id: runId, tab: 'trace' }];
      }
    });
    setSelectedSpanId(null);
    setDetailSpanId(null);
  }, [runId, setOpenTraces, fetchSpansByRunId, setSelectedSpanId, setDetailSpanId]);

  // Extract models and providers
  const usedModels = run.used_models || [];
  const requestModels = run.request_models || [];
  const combineModels = [...usedModels, ...requestModels.filter(n => n.includes('/'))];
  const uniqueModels = Array.from(new Set(combineModels));

  uniqueModels.sort((a, b) => {
    if (a.startsWith("langdb")) return -1;
    if (b.startsWith("langdb")) return 1;
    return 0;
  });

  const modelNamesInvoked = uniqueModels.filter(name => name && typeof name === 'string' && name.trim() !== '');

  const getProviderName = (modelName: string) => {
    const parts = modelName.split('/');
    return parts.length > 1 ? parts[0] : 'default';
  };

  const providers = Array.from(new Set(modelNamesInvoked.map(getProviderName)));

  const tokensInfo = {
    inputTokens: run.input_tokens || 0,
    outputTokens: run.output_tokens || 0,
    totalTokens: (run.input_tokens || 0) + (run.output_tokens || 0),
  };

  const totalCost = run.cost || 0;
  const errors = run.errors || [];
  const startTime = run.start_time_us;
  const finishTime = run.finish_time_us;
  const startTimeMs = startTime / 1000;
  const finishTimeMs = finishTime / 1000;

  const getDurations = (startMs: number, finishMs: number) => {
    return ((finishMs - startMs) / 1000).toFixed(2);
  };

  const duration = finishTime && startTime ? getDurations(startTimeMs, finishTimeMs) : "0.00";

  const startTimeInIsoFormat = useMemo(() => {
    if (!startTime) return "";
    const traceDate = new Date(startTime / 1000);
    return traceDate.toISOString();
  }, [startTime]);

  const messageRef = React.useRef<HTMLDivElement>(null);
  useRelativeTime(messageRef, startTimeInIsoFormat);

  const getTimeDisplay = useCallback(() => {
    if (!startTime) return "";
    return formatMessageTime(startTimeInIsoFormat);
  }, [startTimeInIsoFormat, startTime]);

  const timeAgo = getTimeDisplay();

  const convertTimeMiliSecondsToLocalDateTime = (ms: number, includeSeconds: boolean = false) => {
    const date = new Date(ms);
    return includeSeconds
      ? date.toLocaleString()
      : date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      className={cn(
        "overflow-hidden transition-all ",
        isOpen ? "shadow-md " : "hover:shadow-md hover:bg-[#171717]"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.1) }}
      data-testid={`trace-row-${runId}`}
      data-run-id={runId}
    >
      {/* Table Row Header */}
      <div
        onClick={toggleAccordion}
        className="grid grid-cols-12 divide-x divide-border gap-0 cursor-pointer items-center text-sm"
      >
        {/* Expand/Collapse Button - Col 1 */}
        <div className="col-span-1 flex items-center justify-center py-3 px-2 ">
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
          )}
        </div>

        {/* Run ID - Col 2 */}
        <div className="col-span-2 flex items-center py-3 px-3">
          <span className="font-mono text-xs text-muted-foreground truncate" title={runId}>
            {runId.slice(0, 12)}...
          </span>
        </div>

        {/* Provider/Models - Col 3 */}
        <div className="col-span-2 flex items-center gap-2 py-3 px-3 h-full ">
          {providers.length > 0 && (
            <>
              <ProviderIcon
                provider_name={providers[0]}
                className="h-5 w-5 rounded-full flex-shrink-0"
              />
              {providers.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  +{providers.length - 1}
                </span>
              )}
            </>
          )}
        </div>

        {/* Cost - Col 5 */}
        <div className="col-span-1 flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{formatCost(totalCost)}</span>
        </div>

        {/* Input Tokens - Col 6 */}
        <div className="col-span-1 flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{tokensInfo.inputTokens.toLocaleString()}</span>
        </div>

        {/* Output Tokens - Col 7 */}
        <div className="col-span-1 flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{tokensInfo.outputTokens.toLocaleString()}</span>
        </div>

        {/* Time - Col 4 */}
        <div className="col-span-2 flex items-center gap-1 py-3 px-3 h-full " ref={messageRef}>
          <span className="text-xs text-muted-foreground truncate" title={startTime ? convertTimeMiliSecondsToLocalDateTime(startTimeMs, true) : ''}>
            {timeAgo}
          </span>
        </div>

        

        {/* Duration - Col 8 */}
        <div className="col-span-1 flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{duration}s</span>
        </div>

        {/* Errors - Col 9 */}
        <div className="col-span-1 flex items-center justify-center py-3 px-2 h-full ">
          {errors && errors.length > 0 ? (
            <>
              <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <span className="text-xs text-yellow-500 font-medium">{errors.length}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="border-t border-border"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="overflow-auto custom-scrollbar">
              <DetailedRunViewWrapper run={run} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
