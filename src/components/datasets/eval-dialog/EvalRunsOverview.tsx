/**
 * EvalRunsOverview
 *
 * Overview page for all evaluation runs — shows score trend chart,
 * summary table of runs, and aggregated per-topic breakdown.
 */

import { useMemo, useContext } from "react";
import { BarChart3, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { EvalJobsContext } from "@/contexts/EvalJobsContext";
import { EvalComparisonChart } from "./EvalComparisonChart";
import { evalJobDisplayName } from "@/lib/job-display-name";
import type { EvalJob } from "@/types/eval-job";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EvalRunsOverviewProps {
  readonly workflowId: string;
}

function normalizeStatus(status: string): string {
  if (status === "completed") return "done";
  if (status === "running" || status === "pending") return "running";
  if (status === "failed" || status === "cancelled") return "failed";
  return status;
}

export function EvalRunsOverview(_props: EvalRunsOverviewProps) {
  const evalCtx = useContext(EvalJobsContext);
  const jobs = evalCtx?.jobs ?? [];

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => b.createdAt - a.createdAt),
    [jobs],
  );

  const completedJobs = sortedJobs.filter((j) => j.status === "completed" && j.result);

  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500 p-8">
        <BarChart3 className="h-8 w-8 opacity-30" />
        <p className="text-sm">No evaluation runs yet</p>
        <p className="text-xs text-zinc-600">Run an evaluation to see results here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Score Trend Chart */}
      {completedJobs.length >= 2 && (
        <section>
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.06em] mb-2">
            Score Trend Across Runs
          </h3>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3">
            <EvalComparisonChart jobs={jobs} />
          </div>
        </section>
      )}

      {/* Runs Table */}
      <section>
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.06em] mb-2">
          All Runs ({jobs.length})
        </h3>
        <div className="rounded-lg border border-zinc-800/50 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <TooltipProvider delayDuration={200}>
                <tr className="border-b border-zinc-800/50 text-zinc-500">
                  <th className="text-left px-3 py-2 font-medium">Run</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Model</th>
                  <th className="text-right px-3 py-2 font-medium">Samples</th>
                  <ThWithInfo align="right" label="Mean" tip="Mean = sum of all scores / number of records. Example: scores [0.9, 0.8, 1.0] → mean = 2.7/3 = 0.90. Target: ≥ 0.8" />
                  <ThWithInfo align="right" label="Std Dev" tip="Standard deviation = √(avg of squared differences from mean). Measures how spread out scores are. Example: scores [0.9, 0.8, 1.0] with mean 0.9 → std = √((0+0.01+0.01)/3) = 0.08. Low (< 0.1) = consistent. High (> 0.2) = some records much worse than others." />
                  <ThWithInfo align="right" label="Min" tip="The lowest score any single record received. If min is much lower than mean, investigate that record — it likely has a quality issue the evaluator caught." />
                  <ThWithInfo align="right" label="Max" tip="The highest score any single record received. If max = 1.00 for all runs, the evaluator may be too lenient — consider tightening criteria." />
                  <ThWithInfo align="left" label="Verdict" tip="Automated quality verdict based on score distribution:
• GO — mean ≥ 0.7, std < 0.15, pass rate > 70%. Safe to start training.
• WARNING — mean 0.5–0.7 or high variance. Review low-scoring records before training.
• NO-GO — mean < 0.5 or pass rate < 50%. Fix data quality or evaluator before proceeding." />
                  <th className="text-right px-3 py-2 font-medium">Date</th>
                </tr>
              </TooltipProvider>
            </thead>
            <tbody>
              {sortedJobs.map((job) => (
                <RunRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ThWithInfo({ label, tip, align = "left" }: { readonly label: string; readonly tip: string; readonly align?: "left" | "right" }) {
  return (
    <th className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {label}
            <Info className="h-2.5 w-2.5 text-zinc-600" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p className="text-[11px]">{tip}</p>
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

function RunRow({ job }: { readonly job: EvalJob }) {
  const status = normalizeStatus(job.status);
  const stats = job.result?.statistics;
  const verdict = job.result?.diagnosis?.verdict;
  const displayName = evalJobDisplayName(job.id);

  const statusBadge = status === "done"
    ? "bg-emerald-500/15 text-emerald-400"
    : status === "running"
    ? "bg-blue-500/15 text-blue-400"
    : "bg-red-500/15 text-red-400";

  const verdictColor = verdict === "GO"
    ? "text-emerald-400"
    : verdict === "WARNING"
    ? "text-amber-400"
    : verdict === "NO-GO"
    ? "text-red-400"
    : "text-zinc-600";

  return (
    <tr
      className="border-b border-zinc-800/30 hover:bg-zinc-800/20 cursor-pointer transition-colors"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
          detail: { jobId: job.id, type: "eval" },
        }));
      }}
    >
      <td className="px-3 py-2">
        <span className="font-mono font-medium text-zinc-300 hover:underline">
          {displayName}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusBadge)}>
          {status}
        </span>
      </td>
      <td className="px-3 py-2 text-zinc-400">
        {job.rolloutModel ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-400">
        {job.result?.samplesEvaluated ?? job.sampleSize ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-300">
        {stats ? stats.mean.toFixed(3) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-500">
        {stats ? stats.std.toFixed(3) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-500">
        {stats ? stats.min.toFixed(2) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-500">
        {stats ? stats.max.toFixed(2) : "—"}
      </td>
      <td className="px-3 py-2">
        <span className={cn("font-semibold", verdictColor)}>
          {verdict ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-zinc-600">
        {new Date(job.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}
