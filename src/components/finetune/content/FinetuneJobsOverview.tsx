/**
 * FinetuneJobsOverview
 *
 * Overview page for all training jobs — shows summary table of jobs
 * with status, model, epochs, score, and date. Clickable rows navigate
 * to individual job detail. Mirrors the EvalRunsOverview pattern.
 */

import { useMemo } from "react";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { finetuneJobDisplayName } from "@/lib/job-display-name";
import { getModelDisplayName } from "./utils";
import { useEvaluatorVersions } from "@/hooks/useEvaluatorVersions";
import { EvaluatorVersionBadge } from "@/components/shared/EvaluatorVersionBadge";
import type { FinetuneJob } from "@/services/finetune-api";

interface FinetuneJobsOverviewProps {
  readonly workflowId: string;
}

export function FinetuneJobsOverview({ workflowId }: FinetuneJobsOverviewProps) {
  const { jobs } = FinetuneJobsConsumer();
  const { latestVersion } = useEvaluatorVersions(workflowId);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [jobs],
  );

  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500 p-8">
        <Brain className="h-8 w-8 opacity-30" />
        <p className="text-sm">No training jobs yet</p>
        <p className="text-xs text-zinc-600">Start a training job to see results here</p>
      </div>
    );
  }

  // Build chart data from jobs with eval results
  const chartData = useMemo(() => {
    // Oldest first for chart (left to right = chronological)
    const chronological = [...sortedJobs].reverse();
    return chronological.map((job) => {
      const avgScore = job.eval_metrics?.avg_score ?? null;
      return {
        name: finetuneJobDisplayName(job.id, job.suffix),
        score: avgScore,
        status: job.status,
        jobId: job.id,
      };
    }).filter((d) => d.score != null);
  }, [sortedJobs]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Score comparison chart */}
      {chartData.length >= 2 && (
        <section>
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.06em] mb-2">
            Score Comparison Across Jobs
          </h3>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                  tick={{ fontSize: 10, fill: "#475569" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  width={30}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.[0]) return null;
                    const val = payload[0].value as number;
                    return (
                      <div className="rounded-md border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                        <p className="text-[10px] font-mono text-slate-500 mb-1">{label}</p>
                        <p className="text-[11px]">
                          <span className="text-slate-400">Avg Score: </span>
                          <span className="font-mono font-bold text-[#10b981]">{val.toFixed(3)}</span>
                        </p>
                      </div>
                    );
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <ReferenceLine y={0.8} stroke="#10b981" strokeOpacity={0.2} strokeDasharray="4 4" />
                <ReferenceLine y={0.6} stroke="#eab308" strokeOpacity={0.15} strokeDasharray="4 4" />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={50}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        (entry.score ?? 0) >= 0.8 ? "#10b981"
                          : (entry.score ?? 0) >= 0.6 ? "#eab308"
                          : "#ef4444"
                      }
                      fillOpacity={0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.06em] mb-2">
          All Training Jobs ({jobs.length})
        </h3>
        <div className="rounded-lg border border-zinc-800/50 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800/50 text-zinc-500">
                <th className="text-left px-3 py-2 font-medium">Job</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Model</th>
                <th className="text-right px-3 py-2 font-medium">Epochs</th>
                <th className="text-right px-3 py-2 font-medium">Avg Score</th>
                <th className="text-right px-3 py-2 font-medium">Rows</th>
                <th className="text-left px-3 py-2 font-medium">Provider</th>
                <th className="text-left px-3 py-2 font-medium">Version</th>
                <th className="text-right px-3 py-2 font-medium">Duration</th>
                <th className="text-right px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedJobs.map((job) => (
                <JobRow key={job.id} job={job} latestVersion={latestVersion} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function JobRow({
  job,
  latestVersion,
}: {
  readonly job: FinetuneJob;
  readonly latestVersion: number | null;
}) {
  const displayName = finetuneJobDisplayName(job.id, job.suffix);
  const totalEpochs = job.training_config?.epochs ?? null;
  const metrics = job.eval_metrics;

  const statusBadge = job.status === "succeeded"
    ? "bg-emerald-500/15 text-emerald-400"
    : job.status === "running" || job.status === "pending"
    ? "bg-blue-500/15 text-blue-400"
    : job.status === "cancelled"
    ? "bg-zinc-500/15 text-zinc-400"
    : "bg-red-500/15 text-red-400";

  const statusLabel = job.status === "succeeded" ? "done" : job.status;

  return (
    <tr
      className="border-b border-zinc-800/30 hover:bg-zinc-800/20 cursor-pointer transition-colors"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
          detail: { jobId: job.id, type: "finetune" },
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
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2 text-zinc-400">
        {getModelDisplayName(job.base_model)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-400">
        {metrics?.latest_epoch_with_score != null && totalEpochs != null
          ? `${Math.min(metrics.latest_epoch_with_score, totalEpochs)}/${totalEpochs}`
          : totalEpochs ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-300">
        {metrics?.avg_score != null ? metrics.avg_score.toFixed(3) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-500">
        {metrics?.distinct_rows_with_eval ?? "—"}
      </td>
      <td className="px-3 py-2 text-zinc-500">
        {job.provider}
      </td>
      <td className="px-3 py-2">
        {job.evaluator_version != null && latestVersion != null ? (
          <EvaluatorVersionBadge jobVersion={job.evaluator_version} latestVersion={latestVersion} />
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-zinc-500">
        {formatDuration(job.created_at, job.completed_at)}
      </td>
      <td className="px-3 py-2 text-right text-zinc-600">
        {new Date(job.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0 || !isFinite(ms)) return "—";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
