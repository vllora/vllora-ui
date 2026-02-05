/**
 * QualityStatsRow
 *
 * Displays key quality metrics as a compact horizontal strip.
 * Matches the visual style of OverviewChart.
 */

export interface QualityStatsRowProps {
  totalRows: number;
  rowsWithGroundTruth: number;
  duplicateRows: number;
  conflictingOutputs: number;
}

export function QualityStatsRow({
  totalRows,
  rowsWithGroundTruth,
  duplicateRows,
  conflictingOutputs,
}: QualityStatsRowProps) {
  const groundTruthPercent = totalRows > 0 ? Math.round((rowsWithGroundTruth / totalRows) * 100) : 0;

  return (
    <div className="flex items-center gap-6 px-4 py-2.5 rounded-lg bg-muted/30 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Rows:</span>
        <span className="font-semibold tabular-nums">{totalRows.toLocaleString()}</span>
      </div>

      <div className="w-px h-4 bg-border/50" />

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Ground Truth:</span>
        <span className={`font-semibold tabular-nums ${groundTruthPercent >= 50 ? "text-emerald-500" : "text-amber-500"}`}>
          {rowsWithGroundTruth.toLocaleString()}
        </span>
        <span className="text-muted-foreground">({groundTruthPercent}%)</span>
      </div>

      <div className="w-px h-4 bg-border/50" />

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Duplicates:</span>
        <span className={`font-semibold tabular-nums ${duplicateRows > 0 ? "text-amber-500" : ""}`}>
          {duplicateRows.toLocaleString()}
        </span>
      </div>

      <div className="w-px h-4 bg-border/50" />

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Conflicts:</span>
        <span className={`font-semibold tabular-nums ${conflictingOutputs > 0 ? "text-red-500" : ""}`}>
          {conflictingOutputs.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
