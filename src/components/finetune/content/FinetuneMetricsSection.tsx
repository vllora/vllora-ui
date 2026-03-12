/**
 * FinetuneMetricsSection
 *
 * Wrapper around FinetuneMetricsChart with loading/error/empty states.
 * Fetches training metrics from the API and polls for updates on active jobs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, Activity } from "lucide-react";
import {
  getFinetuneJobMetrics,
  type FinetuneJobMetricPoint,
} from "@/services/finetune-api";
import { FinetuneMetricsChart } from "../FinetuneMetricsChart";

interface FinetuneMetricsSectionProps {
  jobId: string;
  /** The workflow ID (same as dataset ID) — required for the API path */
  workflowId: string;
  isLive?: boolean;
}

const POLL_INTERVAL = 15_000;

export function FinetuneMetricsSection({
  jobId,
  workflowId,
  isLive,
}: FinetuneMetricsSectionProps) {
  const [metrics, setMetrics] = useState<FinetuneJobMetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasDataRef = useRef(false);

  const fetchMetrics = useCallback(
    async (showRefresh: boolean) => {
      if (showRefresh) setIsRefreshing(true);
      try {
        const response = await getFinetuneJobMetrics(workflowId, jobId);
        setMetrics(response.metrics);
        hasDataRef.current = response.metrics.length > 0;
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch metrics";
        // Don't overwrite existing data on poll failure
        if (!hasDataRef.current) {
          setError(message);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [jobId, workflowId]
  );

  // Initial fetch
  useEffect(() => {
    setIsLoading(true);
    setMetrics([]);
    setError(null);
    fetchMetrics(false);
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for updates when live
  useEffect(() => {
    if (!isLive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      fetchMetrics(false);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isLive, fetchMetrics]);

  const handleRefresh = useCallback(() => {
    fetchMetrics(true);
  }, [fetchMetrics]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">Loading training metrics...</span>
      </div>
    );
  }

  if (error && metrics.length === 0) {
    // Hide empty state while job is still running — metrics aren't available yet
    if (isLive) return null;

    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
        <Activity className="h-5 w-5 opacity-40" />
        <span className="text-xs">
          {error.includes("404")
            ? "No training metrics available yet"
            : error}
        </span>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1"
        >
          <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
          Retry
        </button>
      </div>
    );
  }

  if (metrics.length > 0) {
    return (
      <FinetuneMetricsChart
        metrics={metrics}
        isLive={isLive}
      />
    );
  }

  // Hide empty state while job is still running
  if (isLive) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
      <Activity className="h-5 w-5 opacity-40" />
      <span className="text-xs">
        Training metrics will appear here as training progresses.
      </span>
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1"
      >
        <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
        Check for updates
      </button>
    </div>
  );
}
