/**
 * HistogramBars
 *
 * Renders a histogram as a stacked bar with legend,
 * matching the Overview Chart visual style.
 */

import { useMemo } from "react";

// Colors matching the Overview Chart palette
const HISTOGRAM_COLORS = [
  "rgba(59, 130, 246, 0.7)",   // blue
  "rgba(16, 185, 129, 0.7)",   // emerald
  "rgba(245, 158, 11, 0.7)",   // amber
  "rgba(139, 92, 246, 0.7)",   // violet
  "rgba(6, 182, 212, 0.7)",    // cyan
  "rgba(249, 115, 22, 0.7)",   // orange
  "rgba(236, 72, 153, 0.7)",   // pink
  "rgba(20, 184, 166, 0.7)",   // teal
];

const DOT_CLASSES = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
];

export interface HistogramBarsProps {
  /** Data to display as key-value pairs (range -> count) */
  data: Record<string, number>;
  /** Label for the histogram section */
  label: string;
  /** Bar color class (ignored - uses palette for stacked bar) */
  color?: string;
}

interface Segment {
  range: string;
  count: number;
  percent: number;
  color: string;
  dotClass: string;
}

export function HistogramBars({ data, label }: HistogramBarsProps) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const segments: Segment[] = useMemo(() => {
    return entries
      .sort((a, b) => b[1] - a[1]) // Sort by count descending for visual clarity
      .map(([range, count], idx) => ({
        range,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
        color: HISTOGRAM_COLORS[idx % HISTOGRAM_COLORS.length],
        dotClass: DOT_CLASSES[idx % DOT_CLASSES.length],
      }));
  }, [entries, total]);

  // For legend, show max 4 items and group rest as "others"
  const maxLegendItems = 4;
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
        range: `+${otherItems.length} more`,
        count: otherCount,
        percent: otherPercent,
        color: "rgba(156, 163, 175, 0.7)",
        dotClass: "bg-gray-400",
      },
    ];
  }, [segments]);

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>

      {/* Stacked Bar */}
      <div className="h-4 rounded-sm overflow-hidden flex">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className="h-full transition-all"
            style={{
              width: `${seg.percent}%`,
              backgroundColor: seg.color,
              minWidth: seg.percent > 0 ? "2px" : "0",
            }}
            title={`${seg.range}: ${seg.count} (${Math.round(seg.percent)}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {legendItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1 text-xs">
            <div
              className={`w-1.5 h-1.5 rounded-sm shrink-0 ${item.dotClass}`}
            />
            <span className="text-muted-foreground truncate max-w-[80px]" title={item.range}>
              {item.range}
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
