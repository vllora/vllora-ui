import React, { useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "react-error-boundary";
import { GroupDTO } from "@/services/groups-api";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { Loader2 } from "lucide-react";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { CustomErrorFallback } from "@/components/chat/traces/components/custom-error-fallback";
import { TimelineContent } from "@/components/chat/traces/components/TimelineContent";
import { GroupCardHeader } from "./header";

interface GroupCardProps {
  group: GroupDTO;
  index?: number;
}

export const GroupCard: React.FC<GroupCardProps> = ({ group, index = 0 }) => {
  const {
    // openGroups,
    // setOpenGroups,
    hideGroups,
    setHideGroups,
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
  const isOpen =  useMemo(() => {
    return !hideGroups.find(g => g.time_bucket === timeBucket);
  }, [hideGroups, group.time_bucket]);

  const allSpans = groupSpansMap[timeBucket] || [];
  const isLoadingSpans = loadingGroupsByTimeBucket.has(timeBucket);

  useEffect(() => {
    if (isOpen) {
      loadGroupSpans(timeBucket);
    }
  }, [isOpen, loadGroupSpans, timeBucket]);

  const toggleAccordion = useCallback(() => {
    setHideGroups(prev => {
      const isCurrentlyClosed = prev.some(g => g.time_bucket === timeBucket);
      if (isCurrentlyClosed) {
        
        return prev.filter(g => g.time_bucket !== timeBucket);
      } else {
        return [...prev, { time_bucket: timeBucket, tab: 'trace' }];
      }
    });
    // setOpenGroups(prev => {
    //   const isCurrentlyOpen = prev.some(g => g.time_bucket === timeBucket);
    //   if (isCurrentlyOpen) {
    //     return prev.filter(g => g.time_bucket !== timeBucket);
    //   } else {
    //     return [...prev, { time_bucket: timeBucket, tab: 'trace' }];
    //   }
    // });
  }, [timeBucket, setHideGroups]);

  const usedModels = group.used_models || [];
  const uniqueModels = Array.from(new Set(usedModels));

  uniqueModels.sort((a, b) => {
    if (a.startsWith("langdb")) return -1;
    if (b.startsWith("langdb")) return 1;
    return 0;
  });

  const modelNamesInvoked = uniqueModels.filter(name => name && typeof name === 'string' && name.trim() !== '');


  // const providers = Array.from(new Set(modelNamesInvoked.map(getProviderName)));

  // Extract provider info from input_models
  const providersInfo = useMemo(() => {
    const inputModels = modelNamesInvoked || [];
    const providersMap: { provider: string, models: string[] }[] = [];

    inputModels.forEach(modelFullName => {
      if (modelFullName && modelFullName.includes('/')) {
        const [provider, model] = modelFullName.split('/');
        const existingProviderIndex = providersMap.findIndex(p => p.provider === provider);
        if (existingProviderIndex !== -1) {
          providersMap[existingProviderIndex].models.push(model);
        } else {
          providersMap.push({ provider: provider, models: [model] });
        }
      }
    });

    return providersMap;
  }, [modelNamesInvoked]);

  const tokensInfo = {
    inputTokens: group.input_tokens || 0,
    outputTokens: group.output_tokens || 0,
    totalTokens: (group.input_tokens || 0) + (group.output_tokens || 0),
  };

  const totalCost = group.cost || 0;
  const errors = group.errors || [];
  const startTime = group.start_time_us;  
  const startTimeInIsoFormat = useMemo(() => {
    if (!startTime) return "";
    const traceDate = new Date(startTime / 1000);
    return traceDate.toISOString();
  }, [startTime]);

  const messageRef = React.useRef<HTMLDivElement>(null);
  useRelativeTime(messageRef, startTimeInIsoFormat);

  const bucketTimeDisplay = useMemo(() => {
    const date = new Date(timeBucket / 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const bucketDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Today: just show time
    if (bucketDate.getTime() === today.getTime()) {
      return timeStr;
    }

    // Yesterday: show "Yesterday" with time
    if (bucketDate.getTime() === yesterday.getTime()) {
      return `Yesterday, ${timeStr}`;
    }

    // Older: show full date with time
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: now.getFullYear() === date.getFullYear() ? undefined : 'numeric'
    });
    return `${dateStr}, ${timeStr}`;
  }, [timeBucket]);

  return (
    <motion.div
      className={cn(
        "rounded-lg   bg-[#0a0a0a] overflow-hidden transition-all",
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
        className="cursor-pointer py-2 px-5  bg-[#171717]"
      >
        <GroupCardHeader
          isOpen={isOpen}
          bucketTimeDisplay={bucketTimeDisplay}
          providersInfo={providersInfo}
          totalCost={totalCost}
          tokensInfo={tokensInfo}
          errors={errors}
          llm_calls={group.llm_calls}
        />
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
            <div className="overflow-auto custom-scrollbar border-l border-r border-border/50">
              {isLoadingSpans ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading spans...</span>
                </div>
              ) : allSpans.length > 0 ? (
                <div className="flex flex-col gap-3 py-1">
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
