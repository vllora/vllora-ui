import React, { useCallback, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "react-error-boundary";
import { GenericGroupDTO, isTimeGroup, isThreadGroup, isRunGroup } from "@/services/groups-api";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { HideGroupKey } from "@/hooks/useGroupsPagination";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { CustomErrorFallback } from "@/components/chat/traces/components/custom-error-fallback";
import { TimelineContent } from "@/components/chat/traces/components/TimelineContent";
import { GroupCardHeader } from "./header";
import { IdWithCopy } from "./id-with-copy";
import { LoadingState } from "@/components/LoadingState";

interface GroupCardProps {
  group: GenericGroupDTO;
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
    threadSpansMap,
    runSpansMap,
    loadingGroups,
    selectedSpanId,
    setSelectedSpanId,
    setSelectedRunId,
    setDetailSpanId,
    projectId,
    collapsedSpans,
    setCollapsedSpans,
  } = TracesPageConsumer();

  // Get the appropriate key based on group type
  const groupKey: HideGroupKey = useMemo(() => {
    if (isTimeGroup(group)) {
      return { type: 'time', time_bucket: group.group_key.time_bucket };
    } else if (isThreadGroup(group)) {
      return { type: 'thread', thread_id: group.group_key.thread_id };
    } else if (isRunGroup(group)) {
      return { type: 'run', run_id: group.group_key.run_id };
    }
    // Fallback (shouldn't happen)
    return { type: 'time', time_bucket: 0 };
  }, [group]);

  const timeBucket = isTimeGroup(group) ? group.group_key.time_bucket : 0;

  // Check if this group is hidden (collapsed)
  const isOpen = useMemo(() => {
    return !hideGroups.some(hidden => {
      if (hidden.type === 'time' && groupKey.type === 'time') {
        return hidden.time_bucket === groupKey.time_bucket;
      } else if (hidden.type === 'thread' && groupKey.type === 'thread') {
        return hidden.thread_id === groupKey.thread_id;
      } else if (hidden.type === 'run' && groupKey.type === 'run') {
        return hidden.run_id === groupKey.run_id;
      }
      return false;
    });
  }, [hideGroups, groupKey]);

  // Get spans based on group type
  const allSpans = useMemo(() => {
    if (isTimeGroup(group)) {
      return groupSpansMap[timeBucket] || [];
    } else if (isThreadGroup(group)) {
      return threadSpansMap[group.group_key.thread_id] || [];
    } else if (isRunGroup(group)) {
      return runSpansMap[group.group_key.run_id] || [];
    }
    return [];
  }, [group, groupSpansMap, threadSpansMap, runSpansMap, timeBucket]);

  // Check if this specific group is loading
  const isLoadingSpans = useMemo(() => {
    if (groupKey.type === 'time') {
      return loadingGroups.has(`time-${groupKey.time_bucket}`);
    } else if (groupKey.type === 'thread') {
      return loadingGroups.has(`thread-${groupKey.thread_id}`);
    } else if (groupKey.type === 'run') {
      return loadingGroups.has(`run-${groupKey.run_id}`);
    }
    return false;
  }, [loadingGroups, groupKey]);

  // Track previous isOpen state to detect when user manually toggles
  const prevIsOpenRef = useRef(isOpen);

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    // Only load if changed from closed to open (user manually reopened)
    // Skip if it was already open (initial batch load handles that)
    if (!wasOpen && isOpen) {
      loadGroupSpans(group);
    }
  }, [isOpen, loadGroupSpans, group]);

  const toggleAccordion = useCallback(() => {
    setHideGroups(prev => {
      const isCurrentlyClosed = prev.some(hidden => {
        if (hidden.type === 'time' && groupKey.type === 'time') {
          return hidden.time_bucket === groupKey.time_bucket;
        } else if (hidden.type === 'thread' && groupKey.type === 'thread') {
          return hidden.thread_id === groupKey.thread_id;
        } else if (hidden.type === 'run' && groupKey.type === 'run') {
          return hidden.run_id === groupKey.run_id;
        }
        return false;
      });

      if (isCurrentlyClosed) {
        // Remove from hideGroups (open it)
        return prev.filter(hidden => {
          if (hidden.type === 'time' && groupKey.type === 'time') {
            return hidden.time_bucket !== groupKey.time_bucket;
          } else if (hidden.type === 'thread' && groupKey.type === 'thread') {
            return hidden.thread_id !== groupKey.thread_id;
          } else if (hidden.type === 'run' && groupKey.type === 'run') {
            return hidden.run_id !== groupKey.run_id;
          }
          return true;
        });
      } else {
        // Add to hideGroups (close it)
        return [...prev, groupKey];
      }
    });
  }, [groupKey, setHideGroups]);

  const usedModels = group.used_models || [];
  const uniqueModels = Array.from(new Set(usedModels));

  uniqueModels.sort((a: string, b: string) => {
    if (a.startsWith("langdb")) return -1;
    if (b.startsWith("langdb")) return 1;
    return 0;
  });

  const modelNamesInvoked = uniqueModels.filter((name: unknown): name is string =>
    typeof name === 'string' && name.trim() !== ''
  );


  // const providers = Array.from(new Set(modelNamesInvoked.map(getProviderName)));

  // Extract provider info from input_models
  const providersInfo = useMemo(() => {
    const inputModels = modelNamesInvoked || [];
    const providersMap: { provider: string, models: string[] }[] = [];

    inputModels.forEach((modelFullName: string) => {
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

  const titleDisplay = useMemo(() => {
    // Use start_time for thread and run groups, timeBucket for time groups
    const timeToDisplay = isTimeGroup(group) ? timeBucket : startTime;
    const date = new Date(timeToDisplay / 1000);
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

    let baseDisplay: string;

    // Today: just show time
    if (bucketDate.getTime() === today.getTime()) {
      baseDisplay = timeStr;
    }
    // Yesterday: show "Yesterday" with time
    else if (bucketDate.getTime() === yesterday.getTime()) {
      baseDisplay = `Yesterday, ${timeStr}`;
    }
    // Older: show full date with time
    else {
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: now.getFullYear() === date.getFullYear() ? undefined : 'numeric'
      });
      baseDisplay = `${dateStr}, ${timeStr}`;
    }

    // Return React component with group-specific styling
    if (isThreadGroup(group)) {
      return <IdWithCopy label="Thread" fullId={group.group_key.thread_id} timeDisplay={baseDisplay} />;
    } else if (isRunGroup(group)) {
      return <IdWithCopy label="Run" fullId={group.group_key.run_id} timeDisplay={baseDisplay} />;
    }

    return <span title={baseDisplay}>{baseDisplay}</span>;
  }, [timeBucket, group, startTime]);

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
          titleDisplay={titleDisplay}
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
                <LoadingState message="Loading spans" />
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
