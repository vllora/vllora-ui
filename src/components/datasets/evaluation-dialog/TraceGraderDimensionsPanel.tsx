/**
 * TraceGraderDimensionsPanel
 *
 * Displays auto-generated grader dimensions from trace analysis.
 * Shows failure-derived and prompt-rule-derived criteria with their
 * failure rates. Users can review before applying to their grader.
 *
 * Only rendered when trace analysis data is available (combined mode).
 */

import { AlertTriangle, BookOpen, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraderDimension } from "@/types/dataset-types";

interface TraceGraderDimensionsPanelProps {
  readonly dimensions: readonly GraderDimension[];
  readonly calibrationPairCount: number;
}

export function TraceGraderDimensionsPanel({
  dimensions,
  calibrationPairCount,
}: TraceGraderDimensionsPanelProps) {
  const traceDimensions = dimensions.filter((d) => d.source === "trace_failure");
  const ruleDimensions = dimensions.filter((d) => d.source === "prompt_rule");

  if (dimensions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Auto-Generated Grader Dimensions</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {calibrationPairCount} calibration pairs available
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        These dimensions were auto-generated from trace analysis. Review and adjust before training.
        Traces define <em>what to check</em>; your domain knowledge defines <em>what is correct</em>.
      </p>

      {/* Trace-derived dimensions */}
      {traceDimensions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5" />
            From Trace Failures ({traceDimensions.length})
          </div>
          <div className="space-y-1.5">
            {traceDimensions.map((dim, i) => (
              <DimensionRow key={`trace-${i}-${dim.name}`} dimension={dim} />
            ))}
          </div>
        </div>
      )}

      {/* Rule-derived dimensions */}
      {ruleDimensions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            From Prompt Rules ({ruleDimensions.length})
          </div>
          <div className="space-y-1.5">
            {ruleDimensions.slice(0, 10).map((dim, i) => (
              <DimensionRow key={`rule-${i}-${dim.name}`} dimension={dim} />
            ))}
            {ruleDimensions.length > 10 && (
              <p className="text-xs text-muted-foreground pl-3">
                +{ruleDimensions.length - 10} more rules
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DimensionRow({ dimension }: { readonly dimension: GraderDimension }) {
  const isTraceFailure = dimension.source === "trace_failure";
  const failPct = (dimension.failureRate * 100).toFixed(0);

  return (
    <div className="flex items-start gap-2 py-1.5 px-3 rounded-md bg-muted/30 border border-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium truncate">
            {dimension.name}
          </span>
          {isTraceFailure && dimension.failureRate > 0 && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
              dimension.failureRate > 0.4
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : dimension.failureRate > 0.2
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            )}>
              {failPct}% fail
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {dimension.description}
        </p>
      </div>
    </div>
  );
}
