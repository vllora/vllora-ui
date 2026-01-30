/**
 * AnalyticsContent
 *
 * Main content component for displaying dataset analytics.
 * Shows overview stats, message lengths, histograms, tool usage, and topic coverage.
 */

import type { DryRunAnalyticsResponse } from "@/services/finetune-api";
import { EmptyState } from "../DialogStates";
import { DistributionList } from "./DistributionList";
import { HistogramBars } from "./HistogramBars";
import { MessageLengthBars } from "./MessageLengthBars";
import { SectionHeader } from "./SectionHeader";

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

export interface AnalyticsContentProps {
  analytics: DryRunAnalyticsResponse;
}

export function AnalyticsContent({ analytics }: AnalyticsContentProps) {
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
