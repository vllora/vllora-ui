/**
 * EvalPerTopicScores
 *
 * Per-topic score breakdown for a single eval run. Distribution chart is the
 * primary quality signal on the job-detail page; this component now lives in
 * a drawer triggered from the KPI strip, so it always shows the full list
 * and relies on the drawer's own scroll container.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TopicEvalStats } from "@/types/dataset-types";

interface EvalPerTopicScoresProps {
  topicScores: Record<string, TopicEvalStats>;
  /** Dataset average for the reference baseline. */
  datasetAvg?: number;
  onTopicClick?: (topic: string) => void;
}

const STATUS_TONE: Record<TopicEvalStats["status"], { bar: string; text: string; chip: string }> = {
  good: { bar: "bg-emerald-500", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" },
  warning: { bar: "bg-amber-500", text: "text-amber-400", chip: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  problem: { bar: "bg-red-500", text: "text-red-400", chip: "bg-red-500/15 text-red-400 border-red-500/20" },
  unknown: { bar: "bg-zinc-500", text: "text-muted-foreground", chip: "bg-zinc-500/15 text-muted-foreground border-zinc-500/20" },
};

interface TopicRow {
  topic: string;
  mean: number;
  std: number;
  count: number;
  status: TopicEvalStats["status"];
}

function buildRows(topicScores: Record<string, TopicEvalStats>): TopicRow[] {
  return Object.entries(topicScores)
    .map(([topic, s]) => ({ topic, mean: s.mean, std: s.std, count: s.count, status: s.status }))
    .sort((a, b) => a.mean - b.mean); // worst-first surfaces problems
}

export function EvalPerTopicScores({
  topicScores,
  datasetAvg,
  onTopicClick,
}: EvalPerTopicScoresProps) {
  const rows = useMemo(() => buildRows(topicScores), [topicScores]);

  if (rows.length === 0) return null;

  const baseline = datasetAvg ?? rows.reduce((sum, r) => sum + r.mean, 0) / rows.length;
  const baselinePct = Math.round(baseline * 100);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Per-topic scores
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            · {rows.length} topic{rows.length === 1 ? "" : "s"} · worst → best
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-auto text-[10px] text-muted-foreground/60 font-mono cursor-help">
                baseline {baseline.toFixed(2)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs max-w-[220px]">
                Dataset average across all topics. Bars show each topic relative to this baseline.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {rows.map((r) => {
            const pct = Math.round(r.mean * 100);
            const tone = STATUS_TONE[r.status];
            const interactive = !!onTopicClick;
            return (
              <button
                key={r.topic}
                type="button"
                disabled={!interactive}
                onClick={() => onTopicClick?.(r.topic)}
                className={cn(
                  "w-full grid items-center px-4 py-1.5 gap-3 text-left",
                  interactive && "hover:bg-zinc-800/40 cursor-pointer",
                  !interactive && "cursor-default",
                )}
                style={{ gridTemplateColumns: "minmax(0, 1.8fr) 60px minmax(0, 2.2fr) 60px" }}
              >
                <span className="truncate text-xs text-foreground" title={r.topic}>
                  {r.topic}
                </span>
                <span className={cn("text-right text-xs font-mono tabular-nums font-medium", tone.text)}>
                  {r.mean.toFixed(2)}
                </span>
                <div className="relative h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 w-px bg-zinc-500/70"
                    style={{ left: `${baselinePct}%` }}
                  />
                  <div
                    className={cn("h-full rounded-full transition-all", tone.bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-right text-[10px] text-muted-foreground/70 tabular-nums">
                  {r.count} rec{r.count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
