/**
 * TopicsBarCard
 *
 * Summary card showing topic distribution as a horizontal stacked bar.
 * Each segment represents a leaf topic, with width proportional to record count.
 */

import { useMemo } from "react";

// Color palette with 70% opacity for softer appearance (matches UI theme)
const TOPIC_COLORS = [
  "rgba(16, 185, 129, 0.7)",   // emerald-500
  "rgba(59, 130, 246, 0.7)",   // blue-500
  "rgba(139, 92, 246, 0.7)",   // violet-500
  "rgba(245, 158, 11, 0.7)",   // amber-500
  "rgba(6, 182, 212, 0.7)",    // cyan-500
  "rgba(236, 72, 153, 0.7)",   // pink-500
  "rgba(99, 102, 241, 0.7)",   // indigo-500
  "rgba(20, 184, 166, 0.7)",   // teal-500
  "rgba(249, 115, 22, 0.7)",   // orange-500
  "rgba(244, 63, 94, 0.7)",    // rose-500
  "rgba(132, 204, 22, 0.7)",   // lime-500
  "rgba(14, 165, 233, 0.7)",   // sky-500
  "rgba(217, 70, 239, 0.7)",   // fuchsia-500
  "rgba(234, 179, 8, 0.7)",    // yellow-500
  "rgba(168, 85, 247, 0.7)",   // purple-500
  "rgba(34, 197, 94, 0.7)",    // green-500
  "rgba(115, 115, 115, 0.7)",  // neutral-500
  "rgba(100, 116, 139, 0.7)",  // slate-500
  "rgba(113, 113, 122, 0.7)",  // zinc-500
];

const UNCATEGORIZED_COLOR = "rgba(113, 113, 122, 0.5)";

type BalanceRating = "excellent" | "good" | "fair" | "poor" | "critical";

export interface TopicsBarCardProps {
  /** Topic distribution: topic path -> record count */
  topicDistribution: Record<string, number>;
  /** Number of uncategorized records */
  uncategorizedCount: number;
  /** Balance rating */
  balanceRating?: BalanceRating;
  /** Balance score (0-1) */
  balanceScore?: number;
}

interface TopicSegment {
  name: string;
  fullPath: string;
  count: number;
  percent: number;
  color: string;
}

const BALANCE_COLORS: Record<BalanceRating, string> = {
  excellent: "text-emerald-500",
  good: "text-emerald-500",
  fair: "text-amber-500",
  poor: "text-red-500",
  critical: "text-red-500",
};

export function TopicsBarCard({
  topicDistribution,
  uncategorizedCount,
  balanceRating,
  balanceScore,
}: TopicsBarCardProps) {
  // Build segments sorted by count (descending)
  const { segments, total } = useMemo(() => {
    const entries = Object.entries(topicDistribution)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);

    const totalRecords = entries.reduce((sum, e) => sum + e.count, 0) + uncategorizedCount;

    if (totalRecords === 0) {
      return { segments: [] as TopicSegment[], total: 0 };
    }

    // Build segments with colors
    const segs: TopicSegment[] = entries.map((entry, idx) => ({
      name: getDisplayName(entry.path),
      fullPath: entry.path,
      count: entry.count,
      percent: (entry.count / totalRecords) * 100,
      color: TOPIC_COLORS[idx % TOPIC_COLORS.length],
    }));

    // Add uncategorized if any
    if (uncategorizedCount > 0) {
      segs.push({
        name: "Uncategorized",
        fullPath: "",
        count: uncategorizedCount,
        percent: (uncategorizedCount / totalRecords) * 100,
        color: UNCATEGORIZED_COLOR,
      });
    }

    return { segments: segs, total: totalRecords };
  }, [topicDistribution, uncategorizedCount]);

  // Get display name from topic path (last segment)
  function getDisplayName(topicPath: string): string {
    const parts = topicPath.split("/");
    return parts[parts.length - 1];
  }

  // Balance display
  const balanceColorClass = balanceRating ? BALANCE_COLORS[balanceRating] : "text-muted-foreground";

  // Show top N topics in legend
  const MAX_LEGEND_ITEMS = 4;
  const legendItems = useMemo(() => {
    if (segments.length <= MAX_LEGEND_ITEMS) {
      return segments;
    }
    const topItems = segments.slice(0, MAX_LEGEND_ITEMS - 1);
    const otherItems = segments.slice(MAX_LEGEND_ITEMS - 1);
    const otherCount = otherItems.reduce((sum, s) => sum + s.count, 0);
    const otherPercent = otherItems.reduce((sum, s) => sum + s.percent, 0);

    return [
      ...topItems,
      {
        name: `+${otherItems.length} more`,
        fullPath: "",
        count: otherCount,
        percent: otherPercent,
        color: "rgb(156 163 175)",
      },
    ];
  }, [segments]);

  return (
    <div className="px-4 py-3 rounded-lg bg-muted/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Topics</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Balance:</span>
          <span className={`font-medium capitalize ${balanceColorClass}`}>
            {balanceRating ?? "—"}
          </span>
          {balanceScore !== undefined && (
            <span className="text-muted-foreground">
              ({Math.round(balanceScore * 100)}%)
            </span>
          )}
        </div>
      </div>

      {/* Stacked Bar */}
      {segments.length > 0 ? (
        <div className="h-6 rounded-md overflow-hidden flex mb-2">
          {segments.map((seg, idx) => (
            <div
              key={idx}
              className="h-full transition-all hover:brightness-110"
              style={{
                width: `${seg.percent}%`,
                backgroundColor: seg.color,
                minWidth: seg.percent > 0 ? "2px" : "0",
              }}
              title={`${seg.name}: ${seg.count} (${Math.round(seg.percent)}%)`}
            />
          ))}
        </div>
      ) : (
        <div className="h-6 rounded-md bg-gray-400/30 mb-2" />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {legendItems.length > 0 ? (
          legendItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground truncate max-w-[80px]" title={item.fullPath || item.name}>
                {item.name}
              </span>
              <span className="text-muted-foreground">
                {Math.round(item.percent)}%
              </span>
            </div>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No topics configured</span>
        )}
      </div>
    </div>
  );
}
