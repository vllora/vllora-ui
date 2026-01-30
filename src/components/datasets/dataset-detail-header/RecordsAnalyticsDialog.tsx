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

// Color palette for charts
const CHART_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

// Helper to render a histogram as horizontal bars (compact mode for ranges like "100-199")
function HistogramBars({ data, label, color = "bg-blue-500" }: { data: Record<string, number>; label: string; color?: string }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  const maxValue = Math.max(...entries.map(([, v]) => v));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      {entries.map(([range, count]) => (
        <div key={range} className="flex items-center gap-2">
          <span className="text-xs min-w-[60px] text-muted-foreground shrink-0 truncate" title={range}>
            {range}
          </span>
          <div className="flex-1 h-3 bg-muted/50 rounded-sm overflow-hidden">
            <div
              className={`h-full ${color} rounded-sm`}
              style={{ width: `${(count / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {count} ({Math.round((count / total) * 100)}%)
          </span>
        </div>
      ))}
    </div>
  );
}

// Helper to render topic/tool distribution (label above bar for long names)
function DistributionList({ data, emptyMessage, colorful = true }: { data: Record<string, number>; emptyMessage?: string; colorful?: boolean }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return emptyMessage ? (
      <div className="text-xs text-muted-foreground py-2">{emptyMessage}</div>
    ) : null;
  }

  const maxValue = Math.max(...entries.map(([, v]) => v));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="space-y-2">
      {entries.map(([name, count], index) => {
        const barColor = colorful ? CHART_COLORS[index % CHART_COLORS.length] : "bg-blue-500";
        return (
          <div key={name} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground truncate mr-2" title={name}>{name}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {count} ({Math.round((count / total) * 100)}%)
              </span>
            </div>
            <div className="h-2 bg-muted/50 rounded-sm overflow-hidden">
              <div
                className={`h-full ${barColor} rounded-sm`}
                style={{ width: `${(count / maxValue) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Section header
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{children}</h3>;
}

// Message length visualization with horizontal bars
function MessageLengthBars({ system, user, assistant }: { system: number; user: number; assistant: number }) {
  const maxValue = Math.max(system, user, assistant, 1); // Prevent division by zero

  const bars = [
    { label: "System", value: system, color: "bg-violet-500" },
    { label: "User", value: user, color: "bg-blue-500" },
    { label: "Assistant", value: assistant, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/30">
      {bars.map(({ label, value, color }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value.toLocaleString()} chars</span>
          </div>
          <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={`h-full ${color} rounded-full transition-all`}
              style={{ width: `${(value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
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
    <div className="space-y-5">
      {/* Overview Row */}
      {hasQuality && (
        <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30">
          <div>
            <div className="text-lg font-semibold">{quality.total_rows.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Rows</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{quality.rows_with_ground_truth.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">With Ground Truth</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{quality.duplicate_input_rows.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Duplicates</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{quality.conflicting_outputs.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Conflicts</div>
          </div>
        </div>
      )}

      {/* Message Length Stats - with visual bars */}
      {hasQuality && (
        <div>
          <SectionHeader>Average Message Length</SectionHeader>
          <MessageLengthBars
            system={Math.round(quality.avg_system_chars)}
            user={Math.round(quality.avg_user_chars)}
            assistant={Math.round(quality.avg_assistant_chars)}
          />
        </div>
      )}

      {/* Length Histograms */}
      {hasQuality && Object.keys(quality.user_length_histogram || {}).length > 0 && (
        <div>
          <SectionHeader>Message Length Distribution</SectionHeader>
          <div className="space-y-3 p-3 rounded-lg bg-muted/30">
            <HistogramBars data={quality.user_length_histogram} label="User messages" color="bg-blue-500" />
            {Object.keys(quality.assistant_length_histogram || {}).length > 0 && (
              <HistogramBars data={quality.assistant_length_histogram} label="Assistant messages" color="bg-emerald-500" />
            )}
          </div>
        </div>
      )}

      {/* Tool Usage - only show if there are rows with tools */}
      {hasAnalytics && analyticsData.rows_with_tools > 0 && (
        <div>
          <SectionHeader>Tool Usage</SectionHeader>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex gap-6 mb-3">
              <div>
                <span className="text-sm font-medium">{analyticsData.rows_with_tools.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground ml-1">rows with tools</span>
                {analyticsData.total_rows > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({Math.round((analyticsData.rows_with_tools / analyticsData.total_rows) * 100)}%)
                  </span>
                )}
              </div>
              <div>
                <span className="text-sm font-medium">{Object.keys(analyticsData.tool_counts || {}).length}</span>
                <span className="text-xs text-muted-foreground ml-1">unique tools</span>
              </div>
            </div>
            {Object.keys(analyticsData.tool_counts || {}).length > 0 && (
              <DistributionList data={analyticsData.tool_counts} />
            )}
          </div>
        </div>
      )}

      {/* Topic Distribution */}
      {hasAnalytics && (
        <div>
          <SectionHeader>Topic Coverage</SectionHeader>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex gap-6 mb-3">
              <div>
                <span className="text-sm font-medium">{analyticsData.rows_with_topic.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground ml-1">with topic</span>
                {analyticsData.total_rows > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({Math.round((analyticsData.rows_with_topic / analyticsData.total_rows) * 100)}%)
                  </span>
                )}
              </div>
              <div>
                <span className="text-sm font-medium">{analyticsData.rows_without_topic.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground ml-1">without topic</span>
              </div>
            </div>
            {Object.keys(analyticsData.topic_row_counts || {}).length > 0 && (
              <DistributionList data={analyticsData.topic_row_counts} emptyMessage="No topics assigned" />
            )}
          </div>
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
