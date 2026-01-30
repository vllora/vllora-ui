/**
 * RecordsAnalyticsDialog
 *
 * Dialog showing detailed dataset analytics fetched from the server.
 * Displays quality metrics, data distribution, and other insights.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDryRunAnalytics, type DryRunAnalyticsResponse } from "@/services/finetune-api";
import type { DatasetRecord, DataInfo } from "@/types/dataset-types";
import { LoadingState, ErrorState, EmptyState } from "./DialogStates";

// Typed interfaces for analytics response
interface AnalyticsData {
  total_rows: number;
  rows_with_tools: number;
  tool_counts: Record<string, number>;
  system_prompt_counts: Record<string, number>;
  rows_with_topic: number;
  rows_without_topic: number;
  topic_row_counts: Record<string, number>;
  tools_by_topic: Record<string, Record<string, number>>;
}

interface QualityData {
  total_rows: number;
  rows_with_ground_truth: number;
  rows_without_ground_truth: number;
  avg_system_chars: number;
  avg_user_chars: number;
  avg_assistant_chars: number;
  user_length_histogram: Record<string, number>;
  assistant_length_histogram: Record<string, number>;
  duplicate_input_rows: number;
  conflicting_outputs: number;
}

/**
 * Transform a DatasetRecord to the format expected by the analytics API.
 * The API expects rows with a `messages` array and optionally a `topic` field.
 */
function transformRecordToApiFormat(record: DatasetRecord): { messages: unknown[]; topic?: string } | null {
  const data = record.data;
  if (!data || typeof data !== "object") return null;

  let messages: unknown[] = [];

  // If data already has messages at top level, use it
  if ("messages" in data && Array.isArray((data as { messages: unknown[] }).messages)) {
    messages = (data as { messages: unknown[] }).messages;
  } else {
    // If data is in DataInfo format (input/output structure), combine messages
    const dataInfo = data as DataInfo;

    // Add input messages
    if (dataInfo.input?.messages && Array.isArray(dataInfo.input.messages)) {
      messages.push(...dataInfo.input.messages);
    }

    // Add output messages (could be array or single message)
    if (dataInfo.output?.messages) {
      if (Array.isArray(dataInfo.output.messages)) {
        messages.push(...dataInfo.output.messages);
      } else {
        messages.push(dataInfo.output.messages);
      }
    }

    // If we have tool_calls in output, add as assistant message
    if (dataInfo.output?.tool_calls && Array.isArray(dataInfo.output.tool_calls)) {
      messages.push({
        role: "assistant",
        tool_calls: dataInfo.output.tool_calls,
      });
    }
  }

  if (messages.length === 0) return null;

  // Include topic from record if present
  return record.topic
    ? { messages, topic: record.topic }
    : { messages };
}

// Helper to render a histogram as horizontal bars
function HistogramBars({ data, label }: { data: Record<string, number>; label: string }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  const maxValue = Math.max(...entries.map(([, v]) => v));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      {entries.map(([range, count]) => (
        <div key={range} className="flex items-center gap-2">
          <span className="text-xs w-16 text-muted-foreground shrink-0">{range}</span>
          <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded"
              style={{ width: `${(count / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-xs w-12 text-right tabular-nums">
            {count} <span className="text-muted-foreground">({Math.round((count / total) * 100)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// Stat card component
function StatCard({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-muted/50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

// Main analytics content component
function AnalyticsContent({ analytics }: { analytics: DryRunAnalyticsResponse }) {
  const quality = analytics.quality as unknown as QualityData | undefined;
  const analyticsData = analytics.analytics as unknown as AnalyticsData | undefined;

  const hasQuality = quality && Object.keys(quality).length > 0;
  const hasAnalytics = analyticsData && Object.keys(analyticsData).length > 0;

  if (!hasQuality && !hasAnalytics) {
    return <EmptyState message="No analytics data available" />;
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      {hasQuality && (
        <div>
          <h3 className="text-sm font-medium mb-3">Overview</h3>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Total Rows" value={quality.total_rows} />
            <StatCard
              label="With Ground Truth"
              value={quality.rows_with_ground_truth}
              subtitle={quality.total_rows > 0 ? `${Math.round((quality.rows_with_ground_truth / quality.total_rows) * 100)}%` : undefined}
            />
            <StatCard
              label="Duplicates"
              value={quality.duplicate_input_rows}
              subtitle={quality.conflicting_outputs > 0 ? `${quality.conflicting_outputs} conflicts` : undefined}
            />
          </div>
        </div>
      )}

      {/* Message Length Stats */}
      {hasQuality && (
        <div>
          <h3 className="text-sm font-medium mb-3">Average Message Length</h3>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="System" value={`${Math.round(quality.avg_system_chars)} chars`} />
            <StatCard label="User" value={`${Math.round(quality.avg_user_chars)} chars`} />
            <StatCard label="Assistant" value={`${Math.round(quality.avg_assistant_chars)} chars`} />
          </div>
        </div>
      )}

      {/* Length Histograms */}
      {hasQuality && Object.keys(quality.user_length_histogram || {}).length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Message Length Distribution</h3>
          <div className="space-y-4">
            <HistogramBars data={quality.user_length_histogram} label="User messages" />
            {Object.keys(quality.assistant_length_histogram || {}).length > 0 && (
              <HistogramBars data={quality.assistant_length_histogram} label="Assistant messages" />
            )}
          </div>
        </div>
      )}

      {/* Tool Usage */}
      {hasAnalytics && (
        <div>
          <h3 className="text-sm font-medium mb-3">Tool Usage</h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="Rows with Tools"
              value={analyticsData.rows_with_tools}
              subtitle={analyticsData.total_rows > 0 ? `${Math.round((analyticsData.rows_with_tools / analyticsData.total_rows) * 100)}%` : undefined}
            />
            <StatCard
              label="Unique Tools"
              value={Object.keys(analyticsData.tool_counts || {}).length}
            />
          </div>
          {Object.keys(analyticsData.tool_counts || {}).length > 0 && (
            <div className="mt-3">
              <HistogramBars data={analyticsData.tool_counts} label="Tool frequency" />
            </div>
          )}
        </div>
      )}

      {/* Topic Distribution */}
      {hasAnalytics && (
        <div>
          <h3 className="text-sm font-medium mb-3">Topic Coverage</h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="With Topic"
              value={analyticsData.rows_with_topic}
              subtitle={analyticsData.total_rows > 0 ? `${Math.round((analyticsData.rows_with_topic / analyticsData.total_rows) * 100)}%` : undefined}
            />
            <StatCard
              label="Without Topic"
              value={analyticsData.rows_without_topic}
            />
          </div>
          {Object.keys(analyticsData.topic_row_counts || {}).length > 0 && (
            <div className="mt-3">
              <HistogramBars data={analyticsData.topic_row_counts} label="Topics" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface RecordsAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DatasetRecord[];
}

export function RecordsAnalyticsDialog({
  open,
  onOpenChange,
  records,
}: RecordsAnalyticsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<DryRunAnalyticsResponse | null>(null);

  // Fetch analytics when dialog opens
  useEffect(() => {
    if (!open || records.length === 0) {
      return;
    }

    const fetchAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Transform records to the format expected by the API (includes topic)
        const rows = records
          .map((r) => transformRecordToApiFormat(r))
          .filter((row): row is { messages: unknown[]; topic?: string } => row !== null);

        if (rows.length === 0) {
          setError("No valid records to analyze");
          return;
        }

        const response = await getDryRunAnalytics(rows);
        setAnalytics(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch analytics");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [open, records]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setAnalytics(null);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dataset Analytics</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <LoadingState message="Analyzing dataset..." />
        ) : error ? (
          <ErrorState message={error} />
        ) : analytics ? (
          <AnalyticsContent analytics={analytics} />
        ) : (
          <EmptyState
            message={records.length === 0 ? "No records to analyze" : "Loading analytics..."}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
