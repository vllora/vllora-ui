/**
 * EvaluationResultsState
 *
 * Card showing dry run evaluation results with mini histogram.
 * Uses recharts for a clear score distribution visualization.
 */

import { useMemo } from "react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { ChevronRight, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DryRunStats } from "@/types/dataset-types";

interface EvaluationResultsStateProps {
  /** Dry run statistics */
  stats: DryRunStats;
  /** Callback when clicking to view details */
  onDryRunClick?: () => void;
}

const VERDICT_CONFIG = {
  GO: {
    label: "GO",
    pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    title: "Ready to Train",
    description: "Dataset and grader quality look good. Mean score is in ideal range (30-80%) with healthy variance.",
  },
  WARNING: {
    label: "WARNING",
    pill: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    title: "Review Recommended",
    description: "Scores may be too high (>90%) or too low (<10%), or variance is very low. Review samples before training.",
  },
  "NO-GO": {
    label: "NO-GO",
    pill: "bg-red-500/15 text-red-500 border-red-500/30",
    title: "Not Ready",
    description: "Mean score is extreme (<10% or >90%). Dataset or grader needs adjustment before training.",
  },
};

const BINS = [
  { key: "0.0-0.2", label: "0-.2", color: "hsl(0 84% 60%)" },      // red
  { key: "0.2-0.4", label: ".2-.4", color: "hsl(25 95% 53%)" },    // orange
  { key: "0.4-0.6", label: ".4-.6", color: "hsl(45 93% 47%)" },    // amber
  { key: "0.6-0.8", label: ".6-.8", color: "hsl(84 81% 44%)" },    // lime
  { key: "0.8-1.0", label: ".8-1", color: "hsl(142 71% 45%)" },    // emerald
] as const;

export function EvaluationResultsState({
  stats,
  onDryRunClick,
}: EvaluationResultsStateProps) {
  const { statistics, distribution, diagnosis } = stats;
  const verdict = diagnosis.verdict as keyof typeof VERDICT_CONFIG;
  const config = VERDICT_CONFIG[verdict];

  // Transform distribution data for recharts
  const chartData = useMemo(() => {
    return BINS.map((bin) => ({
      name: bin.label,
      count: distribution[bin.key] || 0,
      color: bin.color,
    }));
  }, [distribution]);

  // Find which bin the mean falls into for the reference line
  const meanBinIndex = useMemo(() => {
    const mean = statistics.mean;
    if (mean < 0.2) return 0;
    if (mean < 0.4) return 1;
    if (mean < 0.6) return 2;
    if (mean < 0.8) return 3;
    return 4;
  }, [statistics.mean]);

  return (
    <TooltipProvider delayDuration={200}>
      <button
        onClick={onDryRunClick}
        className="w-full px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors text-left group"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Evaluation</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-help ${config.pill}`}>
                {config.label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-xs">
              <p className="font-medium mb-1">{config.title}</p>
              <p className="text-muted-foreground">{config.description}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Mini Histogram */}
        <div className="h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <ReferenceLine
                x={meanBinIndex}
                stroke="hsl(var(--foreground))"
                strokeDasharray="3 3"
                strokeWidth={1.5}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs mt-1">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  Mean: <span className="text-foreground font-medium tabular-nums">{(statistics.mean * 100).toFixed(0)}%</span>
                  <HelpCircle className="w-3 h-3 opacity-50" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p className="font-medium mb-1">Mean (Average Score)</p>
                <p className="text-muted-foreground">
                  Sum of all scores divided by total samples. Higher is better. Ideal range: 30-80%.
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  Std: <span className="text-foreground font-medium tabular-nums">{(statistics.std * 100).toFixed(0)}%</span>
                  <HelpCircle className="w-3 h-3 opacity-50" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p className="font-medium mb-1">Standard Deviation</p>
                <p className="text-muted-foreground">
                  Measures score spread. Low (&lt;10%) means scores are similar; high (&gt;25%) means varied quality.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="flex items-center gap-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </button>
    </TooltipProvider>
  );
}
