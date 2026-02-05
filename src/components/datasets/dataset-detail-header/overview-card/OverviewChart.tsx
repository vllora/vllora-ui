/**
 * OverviewChart
 *
 * Reusable chart showing records donut and topic distribution bar.
 * Used in both DatasetOverviewCard and RecordsAnalyticsDialog.
 */

import { useMemo } from "react";

// Colors for topic segments
const SEGMENT_COLORS = [
  "rgba(16, 185, 129, 0.7)",   // emerald
  "rgba(59, 130, 246, 0.7)",   // blue
  "rgba(245, 158, 11, 0.7)",   // amber
  "rgba(139, 92, 246, 0.7)",   // violet
  "rgba(6, 182, 212, 0.7)",    // cyan
  "rgba(249, 115, 22, 0.7)",   // orange
  "rgba(236, 72, 153, 0.7)",   // pink
  "rgba(20, 184, 166, 0.7)",   // teal
];

const UNCATEGORIZED_COLOR = "rgba(113, 113, 122, 0.5)";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

const BALANCE_COLORS: Record<BalanceRating, string> = {
  excellent: "text-emerald-500",
  good: "text-emerald-500",
  fair: "text-amber-500",
  poor: "text-red-500",
  critical: "text-red-500",
};

export interface OverviewChartProps {
  total: number;
  original: number;
  generated: number;
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  balanceRating?: BalanceRating;
  balanceScore?: number;
  /** Size variant - affects donut size and text */
  size?: "sm" | "md";
  /** Max legend items to show */
  maxLegendItems?: number;
}

interface TopicSegment {
  name: string;
  fullPath: string;
  count: number;
  percent: number;
  color: string;
}

function getDisplayName(topicPath: string): string {
  const parts = topicPath.split("/");
  return parts[parts.length - 1];
}

export function OverviewChart({
  total,
  original,
  generated,
  topicDistribution,
  uncategorizedCount,
  balanceRating,
  balanceScore,
  size = "sm",
  maxLegendItems = 3,
}: OverviewChartProps) {
  const generatedPercent = total > 0 ? (generated / total) * 100 : 0;
  const originalPercent = total > 0 ? (original / total) * 100 : 0;

  // CSS conic-gradient for donut chart
  const gradientStyle = total > 0
    ? {
        background: `conic-gradient(
          rgb(139 92 246) 0% ${generatedPercent}%,
          rgb(156 163 175) ${generatedPercent}% 100%
        )`,
      }
    : { background: "rgb(156 163 175)" };

  // Build topic segments sorted by count
  const segments = useMemo(() => {
    const entries = Object.entries(topicDistribution)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);

    const totalRecords = entries.reduce((sum, e) => sum + e.count, 0) + uncategorizedCount;

    if (totalRecords === 0) {
      return [] as TopicSegment[];
    }

    const segs: TopicSegment[] = entries.map((entry, idx) => ({
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

  // Balance display
  const balanceColorClass = balanceRating ? BALANCE_COLORS[balanceRating] : "text-muted-foreground";

  // Legend items with overflow handling
  const legendItems = useMemo(() => {
    if (segments.length <= maxLegendItems) {
      return segments;
    }
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
        color: "rgba(156, 163, 175, 0.7)",
      },
    ];
  }, [segments, maxLegendItems]);

  const isMd = size === "md";
  const donutSize = isMd ? "w-16 h-16" : "w-12 h-12";
  const donutInner = isMd ? "inset-2" : "inset-1.5";
  const fontSize = isMd ? "text-xs" : "text-[10px]";
  const barHeight = isMd ? "h-5" : "h-4";
  const dotSize = isMd ? "w-2 h-2" : "w-1.5 h-1.5";

  return (
    <div className="flex gap-4">
      {/* Left side: Records with donut */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Donut Chart */}
        <div className="relative">
          <div className={`${donutSize} rounded-full`} style={gradientStyle} />
          <div className={`absolute ${donutInner} rounded-full bg-muted/50 flex items-center justify-center`}>
            <span className={`${fontSize} font-semibold`}>{total}</span>
          </div>
        </div>

        {/* Records Legend */}
        <div className="min-w-0">
          <div className={`${fontSize} text-muted-foreground mb-0.5`}>Records</div>
          <div className="space-y-0">
            <div className={`flex items-center gap-1.5 ${fontSize}`}>
              <div className={`${dotSize} rounded-full bg-gray-400 shrink-0`} />
              <span className="text-muted-foreground">Original</span>
              <span className="font-medium">{original}</span>
              <span className="text-muted-foreground">({Math.round(originalPercent)}%)</span>
            </div>
            <div className={`flex items-center gap-1.5 ${fontSize}`}>
              <div className={`${dotSize} rounded-full bg-violet-500 shrink-0`} />
              <span className="text-muted-foreground">Generated</span>
              <span className="font-medium">{generated}</span>
              <span className="text-muted-foreground">({Math.round(generatedPercent)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-border/50 self-stretch" />

      {/* Right side: Topics distribution */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5">
          <span className={`${fontSize} text-muted-foreground`}>Topics</span>
          {balanceRating && (
            <div className={`flex items-center gap-1 ${fontSize}`}>
              <span className="text-muted-foreground">Balance:</span>
              <span className={`font-medium capitalize ${balanceColorClass}`}>
                {balanceRating}
              </span>
              {balanceScore !== undefined && (
                <span className="text-muted-foreground">
                  ({Math.round(balanceScore * 100)}%)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stacked Bar */}
        {segments.length > 0 ? (
          <div className={`${barHeight} rounded-sm overflow-hidden flex mb-1.5`}>
            {segments.map((seg, idx) => (
              <div
                key={idx}
                className="h-full transition-all"
                style={{
                  width: `${seg.percent}%`,
                  backgroundColor: seg.color,
                  minWidth: seg.percent > 0 ? "2px" : "0",
                }}
                title={`${seg.fullPath || seg.name}: ${seg.count} (${Math.round(seg.percent)}%)`}
              />
            ))}
          </div>
        ) : (
          <div className={`${barHeight} rounded-sm bg-gray-400/30 mb-1.5`} />
        )}

        {/* Legend */}
        {legendItems.length > 0 ? (
          <div
            className="grid gap-x-3 gap-y-0.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(legendItems.length, maxLegendItems)}, minmax(0, 1fr))` }}
          >
            {legendItems.map((item, idx) => (
              <div key={idx} className={`flex items-center gap-1 ${fontSize} min-w-0`}>
                <div
                  className={`${dotSize} rounded-sm shrink-0`}
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground truncate" title={item.fullPath || item.name}>
                  {item.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {Math.round(item.percent)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className={`${fontSize} text-muted-foreground`}>No topics configured</span>
        )}
      </div>
    </div>
  );
}
