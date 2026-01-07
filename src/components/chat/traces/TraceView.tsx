"use client";

import React, { useState, useMemo } from "react";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { cn } from "@/lib/utils";
import { TraceHeader } from "./components/header";
import { TraceMainContent } from "./components/TraceMainContent";
import { SpanDetailsOverlay } from "./components/SpanDetailsOverlay";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { CurrentAppConsumer } from "@/contexts/CurrentAppContext";
import { AvailableApiKeysConsumer } from "@/contexts/AvailableApiKeys";
import { LabelFilter } from "@/components/label-filter";

interface TraceViewProps {
  threadId: string;
}

export const TraceView: React.FC<TraceViewProps> = React.memo(({ threadId }) => {
  const {
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    loadingMoreRuns,
    detailSpanId,
    openTraces,
    runMap,
    labelFilter,
  } = ChatWindowConsumer();
  const { app_mode } = CurrentAppConsumer();
  const { available_api_keys } = AvailableApiKeysConsumer();
  const [_, setShowErrorDialog] = useState(false);

  // Helper function to truncate error message for display
  const truncateError = (error: string, maxLength: number = 80) => {
    if (error.length <= maxLength) return error;
    return error.substring(0, maxLength) + "...";
  };

  const errorMessage = runsError?.message || null;

  // Filter runs based on selected labels
  const { filteredRuns, totalRuns, matchingRuns } = useMemo(() => {
    const sortedRuns = [...runs].sort((a, b) => a.start_time_us - b.start_time_us);
    const total = sortedRuns.length;

    if (!labelFilter.hasSelection) {
      return { filteredRuns: sortedRuns, totalRuns: total, matchingRuns: total };
    }

    // Filter runs that contain at least one span with a matching label
    const filtered = sortedRuns.filter((run) => {
      if (!run.run_id) return false;
      const spans = runMap[run.run_id] || [];
      return spans.some((span) => {
        const label = (span.attribute as Record<string, unknown> | undefined)?.label as string | undefined;
        return label && labelFilter.selectedLabels.includes(label);
      });
    });

    return { filteredRuns: filtered, totalRuns: total, matchingRuns: filtered.length };
  }, [runs, runMap, labelFilter.selectedLabels, labelFilter.hasSelection]);

  return (
    <div className="relative h-full w-full">
      {/* Main Trace View */}
      <div
        className={cn(
          "flex flex-col flex-1",
          "h-full w-full bg-transparent overflow-auto"
        )}
      >
        {/* Header with actions */}
        <TraceHeader threadId={threadId} />

        {/* Error display - positioned between header and filters */}
        {errorMessage && (
          <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExclamationCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-400 font-medium">
                  Failed to load traces:
                </span>
                <span className="text-xs text-red-300">
                  {truncateError(errorMessage)}
                </span>
                {errorMessage.length > 80 && (
                  <button
                    onClick={() => setShowErrorDialog(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 underline ml-1"
                  >
                    View Details
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refreshRuns()}
                  className="text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    // Clear error (will need to add this to context)
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  <XCircleIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Label Filter */}
        {app_mode === "vllora" && <div className="px-2 py-2 border-b border-border/50">
          <LabelFilter
            selectedLabels={labelFilter.selectedLabels}
            onLabelsChange={labelFilter.setLabels}
            availableLabels={labelFilter.availableLabels}
            isLoading={labelFilter.isLoading}
            placeholder="Filter labels..."
            size="sm"
          />
          {labelFilter.hasSelection && (
            <div className="mt-1 text-[10px] text-muted-foreground text-right">
              Showing {matchingRuns} of {totalRuns} runs
            </div>
          )}
        </div>}

        {/* Main content area */}
        <TraceMainContent
          app_mode={app_mode}
          loadingSpans={runsLoading}
          runs={filteredRuns}
          hasMore={hasMoreRuns}
          loadMoreRuns={loadMoreRuns}
          loadingMore={loadingMoreRuns}
          threadId={threadId}
          openTraces={openTraces}
          available_api_keys={available_api_keys}
          selectedLabels={labelFilter.selectedLabels}
        />
      </div>

      {/* Overlay Sidebar for Span Details */}
      {detailSpanId && (
        <SpanDetailsOverlay
        />
      )}
    </div>
  );
});
