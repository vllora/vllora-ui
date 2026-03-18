/**
 * Job Score Columns
 *
 * Types and helpers for building dynamic score columns from eval + finetune jobs.
 * Each job becomes a table column showing per-record scores, trends, and status.
 */

import type { EvalJob } from "@/types/eval-job";
import type { FinetuneJob, FinetuneJobStatus } from "@/services/finetune-api";

// ─── Types ───

export type JobColumnType = "eval" | "finetune";
export type JobColumnStatus = "completed" | "running" | "queued" | "failed";

export interface JobColumn {
  readonly id: string;
  readonly type: JobColumnType;
  readonly label: string;
  readonly status: JobColumnStatus;
  readonly createdAt: number;
}

export interface RecordJobScore {
  readonly score?: number;
  readonly trend?: number;
  readonly status: JobColumnStatus;
}

// ─── Helpers ───

function mapEvalStatus(status: string): JobColumnStatus {
  if (status === "completed") return "completed";
  if (status === "running" || status === "pending") return "running";
  if (status === "failed" || status === "cancelled") return "failed";
  return "queued";
}

function mapFinetuneStatus(status: FinetuneJobStatus): JobColumnStatus {
  if (status === "succeeded") return "completed";
  if (status === "running") return "running";
  if (status === "pending") return "queued";
  return "failed";
}

/**
 * Build a chronologically sorted list of job columns from eval + finetune jobs.
 * Labels are auto-numbered per type: "Eval v1", "Eval v2", "Train v1", etc.
 */
export function buildJobColumns(
  evalJobs: readonly EvalJob[],
  finetuneJobs: readonly FinetuneJob[],
): JobColumn[] {
  const combined: JobColumn[] = [];

  const sortedEvals = [...evalJobs].sort((a, b) => a.createdAt - b.createdAt);
  const sortedFinetunes = [...finetuneJobs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  sortedEvals.forEach((job, i) => {
    combined.push({
      id: job.id,
      type: "eval",
      label: `Eval v${i + 1}`,
      status: mapEvalStatus(job.status),
      createdAt: job.createdAt,
    });
  });

  sortedFinetunes.forEach((job, i) => {
    combined.push({
      id: job.id,
      type: "finetune",
      label: `Train v${i + 1}`,
      status: mapFinetuneStatus(job.status),
      createdAt: new Date(job.created_at).getTime(),
    });
  });

  combined.sort((a, b) => a.createdAt - b.createdAt);
  return combined;
}

/**
 * Get the score class for a score value.
 */
export function getScoreClass(score: number): string {
  if (score >= 0.8) return "good";
  if (score >= 0.6) return "warn";
  return "bad";
}
