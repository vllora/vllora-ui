"use client";

import React, { useState } from "react";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { cn } from "@/lib/utils";
import { TraceHeader } from "./components/header";
import { TraceMainContent } from "./components/TraceMainContent";
import { SpanDetailsOverlay } from "./components/SpanDetailsOverlay";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

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
    openTraces
  } = ChatWindowConsumer();

  const [_, setShowErrorDialog] = useState(false);

  // Helper function to truncate error message for display
  const truncateError = (error: string, maxLength: number = 80) => {
    if (error.length <= maxLength) return error;
    return error.substring(0, maxLength) + "...";
  };

  const errorMessage = runsError?.message || null;

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
        <TraceHeader />

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

        {/* Main content area */}
        <TraceMainContent
          loadingSpans={runsLoading}
          runs={runs}
          hasMore={hasMoreRuns}
          loadMoreRuns={loadMoreRuns}
          loadingMore={loadingMoreRuns}
          threadId={threadId}
          openTraces={openTraces}
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
