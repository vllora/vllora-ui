import React, { useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "react-error-boundary";
import { GroupDTO } from "@/services/groups-api";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { formatCost } from "@/utils/formatCost";
import { formatMessageTime } from "@/utils/dateUtils";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { RUN_TABLE_GRID_COLUMNS } from './table-layout';
import { ProviderCell } from './cells/ProviderCell';
import { CustomErrorFallback } from "@/components/chat/traces/components/custom-error-fallback";
import { TimelineContent } from "@/components/chat/traces/components/TimelineContent";

interface GroupTableRowProps {
  group: GroupDTO;
  index?: number;
}

export const GroupTableRow: React.FC<GroupTableRowProps> = ({ group, index = 0 }) => {
  const {
    openGroups,
    setOpenGroups,
    loadGroupSpans,
    groupSpansMap,
    loadingGroupsByTimeBucket,
    selectedSpanId,
    setSelectedSpanId,
    setSelectedRunId,
    setDetailSpanId,
    projectId,
    collapsedSpans,
    setCollapsedSpans,
  } = TracesPageConsumer();

  const timeBucket = group.time_bucket;
  const isOpen = openGroups.some(g => g.time_bucket === timeBucket);

  // All spans (root + children) are now fetched directly from the backend
  const allSpans = groupSpansMap[timeBucket] || [];
  const isLoadingSpans = loadingGroupsByTimeBucket.has(timeBucket);

  // Watch for when group is opened and load spans
  useEffect(() => {
    if (isOpen && allSpans.length === 0 && !isLoadingSpans) {
      loadGroupSpans(timeBucket);
    }
  }, [isOpen, timeBucket, loadGroupSpans, allSpans.length, isLoadingSpans]);

  const toggleAccordion = useCallback(() => {
    setOpenGroups(prev => {
      const isCurrentlyOpen = prev.some(g => g.time_bucket === timeBucket);
      if (isCurrentlyOpen) {
        return [];
      } else {
        return [{ time_bucket: timeBucket, tab: 'trace' }];
      }
    });
  }, [timeBucket, setOpenGroups]);

  // Extract models and providers
  const usedModels = group.used_models || [];
  const uniqueModels = Array.from(new Set(usedModels));

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
    inputTokens: group.input_tokens || 0,
    outputTokens: group.output_tokens || 0,
    totalTokens: (group.input_tokens || 0) + (group.output_tokens || 0),
  };

  const totalCost = group.cost || 0;
  const errors = group.errors || [];
  const startTime = group.start_time_us;
  const finishTime = group.finish_time_us;
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

  // Format time bucket as a readable timestamp
  const bucketTimeDisplay = useMemo(() => {
    const date = new Date(timeBucket / 1000);
    return date.toLocaleString();
  }, [timeBucket]);

  return (
    <motion.div
      className={cn(
        "overflow-hidden transition-all ",
        isOpen ? "shadow-md " : "hover:shadow-md hover:bg-[#171717]"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.1) }}
      data-testid={`group-row-${timeBucket}`}
      data-time-bucket={timeBucket}
    >
      <div
        onClick={toggleAccordion}
        className="grid divide-x divide-border gap-0 cursor-pointer items-center text-sm"
        style={{ gridTemplateColumns: RUN_TABLE_GRID_COLUMNS }}
      >
        {/* Expand/Collapse Button */}
        <div className="flex items-center justify-center py-3 px-2 ">
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
          )}
        </div>

        {/* Group ID (Time Bucket) */}
        <div className="flex flex-col gap-1 py-3 px-3 overflow-hidden">
          <span className="text-xs font-medium truncate text-primary" title={bucketTimeDisplay}>
            {bucketTimeDisplay}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {group.count} {group.count === 1 ? 'trace' : 'traces'}
          </span>
        </div>

        {/* Provider/Models */}
        <ProviderCell providers={providers} />

        {/* Cost */}
        <div className="flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{formatCost(totalCost)}</span>
        </div>

        {/* Input Tokens */}
        <div className="flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{tokensInfo.inputTokens.toLocaleString()}</span>
        </div>

        {/* Output Tokens */}
        <div className="flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{tokensInfo.outputTokens.toLocaleString()}</span>
        </div>

        {/* Time */}
        <div className="flex items-center gap-1 py-3 px-3 h-full " ref={messageRef}>
          <span className="text-xs text-muted-foreground truncate" title={startTime ? convertTimeMiliSecondsToLocalDateTime(startTimeMs, true) : ''}>
            {timeAgo}
          </span>
        </div>

        {/* Duration */}
        <div className="flex items-center justify-center py-3 px-2 h-full ">
          <span className="text-xs font-medium tabular-nums">{duration}s</span>
        </div>

        {/* Errors */}
        <div className="flex items-center justify-center py-3 px-2 h-full ">
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
              {isLoadingSpans ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading spans...</span>
                </div>
              ) : allSpans.length > 0 ? (
                <div className="flex flex-col gap-3 py-2">
                  <ErrorBoundary FallbackComponent={CustomErrorFallback}>
                    <TimelineContent
                      spansByRunId={allSpans}
                      projectId={projectId}
                      selectedSpanId={selectedSpanId}
                      setSelectedSpanId={setSelectedSpanId}
                      setSelectedRunId={setSelectedRunId}
                      setDetailSpanId={setDetailSpanId}
                      onToggle={(spanId) => {
                        if (collapsedSpans.includes(spanId)) {
                          setCollapsedSpans(collapsedSpans.filter(id => id !== spanId));
                        } else {
                          setCollapsedSpans([...collapsedSpans, spanId]);
                        }
                      }}
                      isInSidebar={false}
                      collapsedSpans={collapsedSpans}
                    />
                  </ErrorBoundary>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <span className="text-sm text-muted-foreground">No spans found in this group</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
