/**
 * HistogramBars
 *
 * Renders a histogram as horizontal bars with labels on the left.
 * Compact mode suitable for ranges like "100-199", "200-399", etc.
 */

export interface HistogramBarsProps {
  /** Data to display as key-value pairs (range -> count) */
  data: Record<string, number>;
  /** Label for the histogram section */
  label: string;
  /** Bar color class (default: "bg-blue-500") */
  color?: string;
}

export function HistogramBars({ data, label, color = "bg-blue-500" }: HistogramBarsProps) {
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
