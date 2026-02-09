/**
 * OverviewFilledState
 *
 * Shows records stats (donut) and topic distribution (bar) when data exists.
 * Redesigned for full-width display with improved visuals.
 */

import { useMemo } from "react";
import { Database, Layers, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TopicsHelpTooltip } from "./TopicsHelpTooltip";
import { BalanceRatingTooltip } from "./BalanceRatingTooltip";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

// Colors for topic segments - vibrant but not overwhelming
const SEGMENT_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
];

const UNCATEGORIZED_COLOR = "#71717a";

const BALANCE_CONFIG: Record<BalanceRating, { color: string; bgColor: string }> = {
  excellent: { color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  good: { color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  fair: { color: "text-amber-400", bgColor: "bg-amber-500/10" },
  poor: { color: "text-red-400", bgColor: "bg-red-500/10" },
  critical: { color: "text-red-400", bgColor: "bg-red-500/10" },
};

export interface OverviewFilledStateProps {
  total: number;
  original: number;
  generated: number;
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  balanceRating?: BalanceRating;
  balanceScore?: number;
  /** Total number of leaf topics in the hierarchy */
  leafTopicCount?: number;
  onClick?: () => void;
}

function getDisplayName(topicPath: string): string {
  const parts = topicPath.split("/");
  return parts[parts.length - 1];
}

export function OverviewFilledState({
  total,
  original,
  generated,
  topicDistribution,
  uncategorizedCount,
  balanceRating,
  balanceScore,
  leafTopicCount,
  onClick,
}: OverviewFilledStateProps) {
  const generatedPercent = total > 0 ? (generated / total) * 100 : 0;
  const originalPercent = total > 0 ? (original / total) * 100 : 0;

  // Build topic segments sorted by count
  const segments = useMemo(() => {
    const entries = Object.entries(topicDistribution)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);

    const totalRecords = entries.reduce((sum, e) => sum + e.count, 0) + uncategorizedCount;

    if (totalRecords === 0) return [];

    const segs = entries.map((entry, idx) => ({
      name: getDisplayName(entry.path),
      fullPath: entry.path,
      count: entry.count,
      percent: (entry.count / totalRecords) * 100,
      color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
    }));

    if (uncategorizedCount > 0) {
      segs.push({
        name: "Uncategorized",
        fullPath: "",
        count: uncategorizedCount,
        percent: (uncategorizedCount / totalRecords) * 100,
        color: UNCATEGORIZED_COLOR,
      });
    }

    return segs;
  }, [topicDistribution, uncategorizedCount]);

  // Show top 5 topics in legend (since we have more horizontal space now)
  const maxLegendItems = 5;
  const legendItems = useMemo(() => {
    if (segments.length <= maxLegendItems) return segments;
    const topItems = segments.slice(0, maxLegendItems - 1);
    const otherItems = segments.slice(maxLegendItems - 1);
    const otherCount = otherItems.reduce((sum, s) => sum + s.count, 0);
    const otherPercent = otherItems.reduce((sum, s) => sum + s.percent, 0);

    return [
      ...topItems,
      {
        name: `+${otherItems.length} more`,
        fullPath: "",
        count: otherCount,
        percent: otherPercent,
        color: "#9ca3af",
      },
    ];
  }, [segments]);

  const balanceConfig = balanceRating ? BALANCE_CONFIG[balanceRating] : null;

  // Count topics with records vs total leaf topics
  const topicsWithRecords = Object.keys(topicDistribution).length;
  const totalTopics = leafTopicCount ?? topicsWithRecords;
  const emptyTopics = totalTopics - topicsWithRecords;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors cursor-pointer text-left overflow-hidden"
    >
      <div className="flex">
        {/* Left Section: Records Stats */}
        <div className="flex items-center gap-4 px-5 py-4 border-r border-zinc-800">
          {/* Donut Chart */}
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {/* Background circle */}
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#3f3f46"
                strokeWidth="3"
              />
              {/* Original segment (gray) */}
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="3"
                strokeDasharray={`${originalPercent} ${100 - originalPercent}`}
                strokeLinecap="round"
              />
              {/* Generated segment (violet) - offset by original */}
              {generated > 0 && (
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="3"
                  strokeDasharray={`${generatedPercent} ${100 - generatedPercent}`}
                  strokeDashoffset={`-${originalPercent}`}
                  strokeLinecap="round"
                />
              )}
            </svg>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-zinc-100">{total}</span>
            </div>
          </div>

          {/* Records Breakdown */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Records</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-zinc-400">Original</span>
                <span className="font-semibold text-zinc-200">{original}</span>
                <span className="text-zinc-500">({Math.round(originalPercent)}%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-zinc-400">Generated</span>
                <span className="font-semibold text-zinc-200">{generated}</span>
                <span className="text-zinc-500">({Math.round(generatedPercent)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Topics Distribution */}
        <div className="flex-1 px-5 py-4">
          {/* Header with Balance */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Topics</span>
              <span className="text-xs font-semibold text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded">
                {totalTopics}
              </span>
              {emptyTopics > 0 && (
                <span className="text-xs text-amber-500/80">
                  ({emptyTopics} empty)
                </span>
              )}
              {totalTopics > 0 && (
                <TopicsHelpTooltip hasCategorizedRecords={topicsWithRecords > 0} />
              )}
            </div>
            {/* Only show balance when there are categorized records */}
            {balanceConfig && topicsWithRecords > 0 && balanceRating && (
              <BalanceRatingTooltip
                rating={balanceRating}
                score={balanceScore}
                colorClass={balanceConfig.color}
                bgColorClass={balanceConfig.bgColor}
              />
            )}
          </div>

          {/* Stacked Bar */}
          {segments.length > 0 ? (
            <div className="h-5 rounded-md overflow-hidden flex bg-zinc-800 mb-3">
              {segments.map((seg, idx) => (
                <div
                  key={idx}
                  className="h-full transition-all hover:opacity-80"
                  style={{
                    width: `${seg.percent}%`,
                    backgroundColor: seg.color,
                    minWidth: seg.percent > 0 ? "3px" : "0",
                  }}
                  title={`${seg.fullPath || seg.name}: ${seg.count} (${Math.round(seg.percent)}%)`}
                />
              ))}
            </div>
          ) : (
            <div className="h-5 rounded-md bg-zinc-800 mb-3" />
          )}

          {/* Legend */}
          {totalTopics > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {legendItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-zinc-400 truncate max-w-[120px]" title={item.fullPath || item.name}>
                    {item.name}
                  </span>
                  <span className="text-zinc-500">{Math.round(item.percent)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <span className="text-xs text-zinc-500">No topics yet</span>
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-600" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-[280px]">
                  <div className="text-xs space-y-2">
                    <p className="font-semibold">What are topics?</p>
                    <p className="text-muted-foreground">
                      Topics organize your training data into categories (e.g., "greeting", "troubleshooting", "billing").
                      This helps ensure balanced coverage across different use cases.
                    </p>
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Why it matters:</span> Models trained on balanced topic distribution
                      perform more consistently across all scenarios.
                    </p>
                    <p className="text-amber-400 text-[10px]">
                      Use the AI assistant to auto-generate topics from your data.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </button>
  );
}
