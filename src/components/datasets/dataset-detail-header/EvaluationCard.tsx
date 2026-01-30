/**
 * EvaluationCard
 *
 * Summary card showing evaluation score distribution.
 * Shows blank state if evaluation is not configured.
 */

import { FlaskConical } from "lucide-react";
import type { DryRunStats, EvaluationConfig } from "@/types/dataset-types";

export interface EvaluationCardProps {
  /** Evaluation configuration (if set) */
  evaluationConfig?: EvaluationConfig;
  /** Dry run stats (if evaluation has been run) */
  dryRunStats?: DryRunStats;
}

const VERDICT_COLORS = {
  GO: "text-emerald-500",
  WARNING: "text-amber-500",
  "NO-GO": "text-red-500",
};

const VERDICT_BG = {
  GO: "bg-emerald-500",
  WARNING: "bg-amber-500",
  "NO-GO": "bg-red-500",
};

export function EvaluationCard({ evaluationConfig, dryRunStats }: EvaluationCardProps) {
  // No evaluation config - show setup prompt
  if (!evaluationConfig) {
    return (
      <div className="px-4 py-3 rounded-lg bg-muted/50 flex items-center justify-center min-h-[88px]">
        <div className="flex flex-col items-center gap-1 text-center">
          <FlaskConical className="w-5 h-5 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground">
            Evaluation not configured
          </span>
        </div>
      </div>
    );
  }

  // Config exists but no dry run yet
  if (!dryRunStats) {
    return (
      <div className="px-4 py-3 rounded-lg bg-muted/50 flex items-center justify-center min-h-[88px]">
        <div className="flex flex-col items-center gap-1 text-center">
          <FlaskConical className="w-5 h-5 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground">
            Run dry run to see scores
          </span>
        </div>
      </div>
    );
  }

  // Show evaluation results
  const { statistics, distribution, diagnosis } = dryRunStats;
  const verdict = diagnosis.verdict;
  const verdictColor = VERDICT_COLORS[verdict];

  // Calculate bar widths for distribution
  const maxCount = Math.max(
    distribution["0.0-0.2"],
    distribution["0.2-0.4"],
    distribution["0.4-0.6"],
    distribution["0.6-0.8"],
    distribution["0.8-1.0"]
  );

  const bars = [
    { label: "0-0.2", count: distribution["0.0-0.2"], color: "bg-red-500/70" },
    { label: "0.2-0.4", count: distribution["0.2-0.4"], color: "bg-orange-500/70" },
    { label: "0.4-0.6", count: distribution["0.4-0.6"], color: "bg-amber-500/70" },
    { label: "0.6-0.8", count: distribution["0.6-0.8"], color: "bg-lime-500/70" },
    { label: "0.8-1", count: distribution["0.8-1.0"], color: "bg-emerald-500/70" },
  ];

  return (
    <div className="px-4 py-3 rounded-lg bg-muted/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Evaluation</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Verdict:</span>
          <span className={`font-medium ${verdictColor}`}>{verdict}</span>
        </div>
      </div>

      {/* Score Distribution Bars */}
      <div className="flex items-end gap-1 h-6 mb-2">
        {bars.map((bar) => (
          <div
            key={bar.label}
            className="flex-1 flex flex-col items-center"
            title={`${bar.label}: ${bar.count} samples`}
          >
            <div
              className={`w-full rounded-sm ${bar.color} transition-all`}
              style={{
                height: maxCount > 0 ? `${(bar.count / maxCount) * 100}%` : "2px",
                minHeight: bar.count > 0 ? "4px" : "2px",
              }}
            />
          </div>
        ))}
      </div>

      {/* Stats Legend */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Mean: <span className="font-medium text-foreground">{(statistics.mean * 100).toFixed(0)}%</span>
          </span>
          <span className="text-muted-foreground">
            Std: <span className="font-medium text-foreground">{(statistics.std * 100).toFixed(0)}%</span>
          </span>
        </div>
        <div className={`w-2 h-2 rounded-full ${VERDICT_BG[verdict]}`} />
      </div>
    </div>
  );
}
