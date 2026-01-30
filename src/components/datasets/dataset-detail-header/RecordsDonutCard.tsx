/**
 * RecordsDonutCard
 *
 * Displays a donut chart showing the distribution of original vs generated records.
 * Uses CSS conic-gradient for the chart visualization.
 * Clickable to show detailed analytics dialog.
 */

export interface RecordsDonutCardProps {
  total: number;
  original: number;
  generated: number;
  /** Callback when card is clicked to show details */
  onClick?: () => void;
}

export function RecordsDonutCard({ total, original, generated, onClick }: RecordsDonutCardProps) {
  const generatedPercent = total > 0 ? (generated / total) * 100 : 0;
  const originalPercent = total > 0 ? (original / total) * 100 : 0;

  // CSS conic-gradient for donut chart
  // Original = muted gray, Generated = violet
  const gradientStyle = total > 0
    ? {
        background: `conic-gradient(
          rgb(139 92 246) 0% ${generatedPercent}%,
          rgb(156 163 175) ${generatedPercent}% 100%
        )`,
      }
    : { background: "rgb(156 163 175)" };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer w-full text-left"
    >
      {/* Donut Chart */}
      <div className="relative shrink-0">
        <div
          className="w-14 h-14 rounded-full"
          style={gradientStyle}
        />
        {/* Inner circle (creates donut hole) */}
        <div className="absolute inset-2 rounded-full bg-muted/50 flex items-center justify-center">
          <span className="text-xs font-semibold">{total}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground mb-1">Records</div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
            <span className="text-muted-foreground">Original</span>
            <span className="font-medium ml-auto">{original.toLocaleString()}</span>
            <span className="text-muted-foreground w-10 text-right">{Math.round(originalPercent)}%</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
            <span className="text-muted-foreground">Generated</span>
            <span className="font-medium ml-auto">{generated.toLocaleString()}</span>
            <span className="text-muted-foreground w-10 text-right">{Math.round(generatedPercent)}%</span>
          </div>
        </div>
      </div>
    </button>
  );
}
