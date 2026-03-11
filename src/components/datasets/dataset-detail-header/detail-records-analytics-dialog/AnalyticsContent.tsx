/**
 * AnalyticsContent
 *
 * Main content component for displaying dataset analytics.
 * Shows overview chart, quality stats, message lengths, histograms, tool usage, and topic coverage.
 */

import type { EvalAnalyticsResponse } from "@/services/finetune-api";
import { EmptyState } from "../DialogStates";
import { OverviewChart } from "../overview-card";
import { DistributionList } from "./DistributionList";
import { HistogramBars } from "./HistogramBars";
import { MessageLengthBars } from "./MessageLengthBars";
import { QualityStatsRow } from "./QualityStatsRow";
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

export interface RecordStats {
  total: number;
  original: number;
  generated: number;
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  balanceRating?: "excellent" | "good" | "fair" | "poor" | "critical";
  balanceScore?: number;
}

export interface AnalyticsContentProps {
  analytics: EvalAnalyticsResponse;
  recordStats?: RecordStats;
}

export function AnalyticsContent({ analytics, recordStats }: AnalyticsContentProps) {
  const quality = analytics.quality as unknown as QualityData | undefined;
  const analyticsData = analytics.analytics as unknown as AnalyticsData | undefined;

  const hasQuality = quality && Object.keys(quality).length > 0;
  const hasAnalytics = analyticsData && Object.keys(analyticsData).length > 0;

  if (!hasQuality && !hasAnalytics) {
    return <EmptyState message="No analytics data available" />;
  }

  return (
    <div className="space-y-4">
      {/* Overview Chart - Records & Topics */}
      {recordStats && recordStats.total > 0 && (
        <div className="p-4 rounded-lg bg-muted/30">
          <OverviewChart
            total={recordStats.total}
            original={recordStats.original}
            generated={recordStats.generated}
            topicDistribution={recordStats.topicDistribution}
            uncategorizedCount={recordStats.uncategorizedCount}
            balanceRating={recordStats.balanceRating}
            balanceScore={recordStats.balanceScore}
            size="md"
            maxLegendItems={5}
          />
        </div>
      )}

      {/* Quality Stats Row */}
      {hasQuality && (
        <QualityStatsRow
          totalRows={quality.total_rows}
          rowsWithGroundTruth={quality.rows_with_ground_truth}
          duplicateRows={quality.duplicate_input_rows}
          conflictingOutputs={quality.conflicting_outputs}
        />
      )}

      {/* Message Length + Histograms in a 2-column grid */}
      {hasQuality && (
        <div className="grid grid-cols-2 gap-3">
          {/* Left: Average Message Length */}
          <div className="p-3 rounded-lg bg-muted/30">
            <SectionHeader>Average Message Length (chars)</SectionHeader>
            <MessageLengthBars
              system={Math.round(quality.avg_system_chars)}
              user={Math.round(quality.avg_user_chars)}
              assistant={Math.round(quality.avg_assistant_chars)}
            />
          </div>

          {/* Right: Length Distribution */}
          {Object.keys(quality.user_length_histogram || {}).length > 0 && (
            <div className="p-3 rounded-lg bg-muted/30 space-y-3">
              <SectionHeader>Length Distribution</SectionHeader>
              <HistogramBars data={quality.user_length_histogram} label="User messages" />
              {Object.keys(quality.assistant_length_histogram || {}).length > 0 && (
                <HistogramBars data={quality.assistant_length_histogram} label="Assistant messages" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Tool Usage - only show if there are rows with tools */}
      {hasAnalytics && analyticsData.rows_with_tools > 0 && (
        <div className="p-3 rounded-lg bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <SectionHeader>Tool Usage</SectionHeader>
            <div className="flex items-center gap-3 text-xs">
              <span>
                <span className="font-medium">{analyticsData.rows_with_tools.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1">rows</span>
                {analyticsData.total_rows > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({Math.round((analyticsData.rows_with_tools / analyticsData.total_rows) * 100)}%)
                  </span>
                )}
              </span>
              <span>
                <span className="font-medium">{Object.keys(analyticsData.tool_counts || {}).length}</span>
                <span className="text-muted-foreground ml-1">unique tools</span>
              </span>
            </div>
          </div>
          {Object.keys(analyticsData.tool_counts || {}).length > 0 && (
            <DistributionList data={analyticsData.tool_counts} />
          )}
        </div>
      )}
    </div>
  );
}
