/**
 * DistributionList
 *
 * Renders a distribution of items (topics, tools, etc.) as horizontal bars.
 * Labels are displayed above bars to accommodate long names like topic paths.
 */

// Color palette for charts
export const CHART_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
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

export function DistributionList({ data, emptyMessage, colorful = true }: DistributionListProps) {
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
