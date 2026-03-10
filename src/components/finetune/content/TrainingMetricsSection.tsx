/**
 * TrainingMetricsSection
 *
 * Wrapper around TrainingMetricsChart with loading / error / empty states.
 * Passes isLive flag to the chart for the live indicator badge.
 */

import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, BarChart3 } from "lucide-react";
import { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { TrainingMetricsChart } from "../TrainingMetricsChart";

interface TrainingMetricsSectionProps {
  evalResults: FinetuneEvalResultsResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Whether the training job is currently running (shows Live badge on chart) */
  isLive?: boolean;
}

export function TrainingMetricsSection({
  evalResults,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
  isLive,
}: TrainingMetricsSectionProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">Loading evaluation metrics...</span>
      </div>
    );
  }

  if (error) {
    // Hide empty state while job is still running
    if (isLive) return null;

    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
        <BarChart3 className="h-5 w-5 opacity-40" />
        <span className="text-xs">
          {error.includes("404")
            ? "No evaluation metrics available yet"
            : error}
        </span>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1"
        >
          <RefreshCw
            className={cn("h-3 w-3", isRefreshing && "animate-spin")}
          />
          Retry
        </button>
      </div>
    );
  }

  if (evalResults && evalResults.results.length > 0) {
    return (
      <TrainingMetricsChart
        results={evalResults.results}
        isLive={isLive}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
      <BarChart3 className="h-5 w-5 opacity-40" />
      <span className="text-xs">
        Metrics will appear here as training progresses.
      </span>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1"
      >
        <RefreshCw
          className={cn("h-3 w-3", isRefreshing && "animate-spin")}
        />
        Check for updates
      </button>
    </div>
  );
}
