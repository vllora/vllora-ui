/**
 * Job Score Columns
 *
 * Types and helpers for building dynamic score columns from eval + finetune jobs.
 * Each job becomes a table column showing per-record scores, trends, and status.
 */

import type { EvalJob } from "@/types/eval-job";
import type { FinetuneJob, FinetuneJobStatus } from "@/services/finetune-api";
import { evalJobDisplayName, finetuneJobDisplayName } from "@/lib/job-display-name";

// ─── Types ───

export type JobColumnType = "eval" | "finetune";
export type JobColumnStatus = "completed" | "running" | "queued" | "failed";

export interface JobColumn {
  readonly id: string;
  readonly type: JobColumnType;
  readonly label: string;
  readonly status: JobColumnStatus;
  readonly createdAt: number;
  readonly model?: string;
}

export interface RecordJobScore {
  readonly score?: number;
  readonly trend?: number;
  readonly status: JobColumnStatus;
  readonly reason?: string;
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
 * Build job columns grouped by type: eval columns first, then finetune columns.
 * Within each group, columns are sorted chronologically (oldest → newest, left → right).
 * Labels use actual job IDs (e.g., "eval-f05e2c", "ft-abc123") matching the sidebar.
 */
export function buildJobColumns(
  evalJobs: readonly EvalJob[],
  finetuneJobs: readonly FinetuneJob[],
): JobColumn[] {
  const evalColumns: JobColumn[] = [...evalJobs]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((job) => ({
      id: job.id,
      type: "eval" as const,
      label: evalJobDisplayName(job.id),
      status: mapEvalStatus(job.status),
      createdAt: job.createdAt,
      model: job.rolloutModel,
    }));

  const finetuneColumns: JobColumn[] = [...finetuneJobs]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((job) => ({
      id: job.id,
      type: "finetune" as const,
      label: finetuneJobDisplayName(job.id, job.suffix),
      status: mapFinetuneStatus(job.status),
      createdAt: new Date(job.created_at).getTime(),
      model: job.base_model,
    }));

  return [...evalColumns, ...finetuneColumns];
}

/**
 * Get the score class for a score value.
 */
export function getScoreClass(score: number): string {
  if (score >= 0.8) return "good";
  if (score >= 0.6) return "warn";
  return "bad";
}
