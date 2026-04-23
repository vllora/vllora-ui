/**
 * KnowledgeCoverageBreakdown
 *
 * Inline per-source knowledge coverage drilldown.
 * Shows overall progress bar + per-source rows with coverage bars
 * and expandable uncovered chunk lists.
 */

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeCoverageStats } from "@/types/dataset-types";

interface KnowledgeCoverageBreakdownProps {
  readonly coverage: KnowledgeCoverageStats;
  readonly onNavigateToSource?: (sourceId: string) => void;
}

function coverageColor(pct: number): string {
  if (pct >= 70) return "bg-emerald-500/40";
  if (pct >= 40) return "bg-amber-500/40";
  return "bg-red-500/40";
}

function coverageTextColor(pct: number): string {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-red-400";
}

export function KnowledgeCoverageBreakdown({
  coverage,
  onNavigateToSource,
}: KnowledgeCoverageBreakdownProps) {
  const sourceEntries = Object.entries(coverage.bySource);

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/80">Overall Coverage</span>
          <span className={cn("text-xs font-mono tabular-nums font-semibold", coverageTextColor(coverage.coveragePercent))}>
            {coverage.coveredChunks}/{coverage.totalChunks} ({coverage.coveragePercent}%)
          </span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", coverageColor(coverage.coveragePercent))}
            style={{ width: `${coverage.coveragePercent}%` }}
          />
        </div>
      </div>

      {/* Per-source rows */}
      {sourceEntries.length > 0 && (
        <div className="space-y-1">
          {sourceEntries.map(([sourceId, source]) => (
            <SourceCoverageRow
              key={sourceId}
              sourceId={sourceId}
              sourceName={source.sourceName}
              totalChunks={source.totalChunks}
              coveredChunks={source.coveredChunks}
              coveragePercent={source.coveragePercent}
              uncoveredChunkIds={source.uncoveredChunkIds}
              onNavigate={onNavigateToSource}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCoverageRow({
  sourceId,
  sourceName,
  totalChunks,
  coveredChunks,
  coveragePercent,
  uncoveredChunkIds,
  onNavigate,
}: {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly totalChunks: number;
  readonly coveredChunks: number;
  readonly coveragePercent: number;
  readonly uncoveredChunkIds: string[];
  readonly onNavigate?: (sourceId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasUncovered = uncoveredChunkIds.length > 0;

  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <FileText className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <button
          type="button"
          onClick={() => onNavigate?.(sourceId)}
          className={cn(
            "flex-1 text-xs text-foreground/80 truncate text-left",
            onNavigate && "hover:text-foreground cursor-pointer",
          )}
          title={sourceName}
        >
          {sourceName}
        </button>
        <div className="w-24 h-3 bg-muted/30 rounded-full overflow-hidden shrink-0">
          <div
            className={cn("h-full rounded-full", coverageColor(coveragePercent))}
            style={{ width: `${coveragePercent}%` }}
          />
        </div>
        <span className={cn("text-[10px] font-mono tabular-nums w-16 text-right shrink-0", coverageTextColor(coveragePercent))}>
          {coveredChunks}/{totalChunks}
        </span>
        {hasUncovered && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="p-0.5 hover:bg-muted/30 rounded transition-colors"
          >
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground/50 transition-transform",
              expanded && "rotate-180",
            )} />
          </button>
        )}
      </div>
      {expanded && hasUncovered && (
        <div className="px-3 pb-2 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 mb-1">
            {uncoveredChunkIds.length} uncovered chunk{uncoveredChunkIds.length !== 1 ? "s" : ""}:
          </p>
          <div className="flex flex-wrap gap-1">
            {uncoveredChunkIds.slice(0, 20).map((chunkId) => (
              <span
                key={chunkId}
                className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70 font-mono truncate max-w-[200px]"
                title={chunkId}
              >
                {chunkId}
              </span>
            ))}
            {uncoveredChunkIds.length > 20 && (
              <span className="text-[9px] text-muted-foreground/40 italic">
                +{uncoveredChunkIds.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
