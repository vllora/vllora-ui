/**
 * DistributionList
 *
 * Renders a distribution of items (topics, tools, etc.) as a stacked bar
 * with legend, matching the Overview Chart visual style.
 */

import { useMemo } from "react";

// Colors matching the Overview Chart palette
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

const DOT_CLASSES = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
];

export interface DistributionListProps {
  /** Data to display as key-value pairs (name -> count) */
  data: Record<string, number>;
  /** Message to show when data is empty */
  emptyMessage?: string;
  /** Whether to use different colors for each bar (default: true) */
  colorful?: boolean;
}

interface Segment {
  name: string;
  count: number;
  percent: number;
  color: string;
  dotClass: string;
}

function getDisplayName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

export function DistributionList({ data, emptyMessage }: DistributionListProps) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return emptyMessage ? (
      <div className="text-xs text-muted-foreground py-2">{emptyMessage}</div>
    ) : null;
  }

  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const segments: Segment[] = useMemo(() => {
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], idx) => ({
        name,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
        color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
        dotClass: DOT_CLASSES[idx % DOT_CLASSES.length],
      }));
  }, [entries, total]);

  // For legend, show max 5 items and group rest
  const maxLegendItems = 5;
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
        count: otherCount,
        percent: otherPercent,
        color: "rgba(156, 163, 175, 0.7)",
        dotClass: "bg-gray-400",
      },
    ];
  }, [segments]);

  return (
    <div className="space-y-2">
      {/* Stacked Bar */}
      <div className="h-5 rounded-sm overflow-hidden flex">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className="h-full transition-all"
            style={{
              width: `${seg.percent}%`,
              backgroundColor: seg.color,
              minWidth: seg.percent > 0 ? "2px" : "0",
            }}
            title={`${seg.name}: ${seg.count} (${Math.round(seg.percent)}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {legendItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2 h-2 rounded-sm shrink-0 ${item.dotClass}`} />
            <span className="text-muted-foreground truncate max-w-[100px]" title={item.name}>
              {getDisplayName(item.name)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {Math.round(item.percent)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
