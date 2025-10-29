import React, { useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "react-error-boundary";
import { GroupDTO } from "@/services/groups-api";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { ExclamationTriangleIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { formatCost } from "@/utils/formatCost";
import { formatMessageTime } from "@/utils/dateUtils";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { ProviderCell } from './cells/ProviderCell';
import { CustomErrorFallback } from "@/components/chat/traces/components/custom-error-fallback";
import { TimelineContent } from "@/components/chat/traces/components/TimelineContent";

interface GroupCardProps {
  group: GroupDTO;
  index?: number;
}

export const GroupCard: React.FC<GroupCardProps> = ({ group, index = 0 }) => {
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

  const allSpans = groupSpansMap[timeBucket] || [];
  const isLoadingSpans = loadingGroupsByTimeBucket.has(timeBucket);

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

  const bucketTimeDisplay = useMemo(() => {
    const date = new Date(timeBucket / 1000);
    return date.toLocaleString();
  }, [timeBucket]);

  return (
    <motion.div
      className={cn(
        "rounded-lg  bg-[#0a0a0a] overflow-hidden transition-all",
        isOpen ? "shadow-lg ring-2 ring-[rgb(var(--theme-500))]/20" : "hover:shadow-md hover:bg-[#171717]"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.1) }}
      data-testid={`group-card-${timeBucket}`}
      data-time-bucket={timeBucket}
    >
      <div
        onClick={toggleAccordion}
        className="cursor-pointer p-4 bg-[#171717]"
      >
        {/* Single Row with Time on left, Stats and Errors on right */}
        <div className="flex items-center  justify-between gap-6">
          {/* Left: Expand button and Time info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isOpen ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-primary truncate" title={bucketTimeDisplay}>
                {bucketTimeDisplay}
              </h3>
              
            </div>
          </div>

          {/* Right: Stats and Errors */}
          <div className="flex items-center gap-6 flex-shrink-0">
            {/* Provider */}
            <div className="flex items-center gap-2">
              <ProviderCell providers={providers} />
            </div>

            {/* Cost */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Cost</span>
              <span className="text-sm font-semibold tabular-nums">{formatCost(totalCost)}</span>
            </div>

            {/* Input Tokens */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Input</span>
              <span className="text-sm font-semibold tabular-nums">{tokensInfo.inputTokens.toLocaleString()}</span>
            </div>

            {/* Output Tokens */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Output</span>
              <span className="text-sm font-semibold tabular-nums">{tokensInfo.outputTokens.toLocaleString()}</span>
            </div>

            {/* Duration */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Duration</span>
              <span className="text-sm font-semibold tabular-nums">{duration}s</span>
            </div>

            {/* Status Badge */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className="flex items-center gap-1">{errors && errors.length > 0 ? (
                <div className="flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-red-500 font-medium">{errors.length}</span>
                </div>
              ) : (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className=""
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
                <div className="flex flex-col gap-3 py-2 px-4">
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
