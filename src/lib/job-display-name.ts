/**
 * Display name helpers for eval and finetune jobs.
 *
 * Centralized so the sidebar, table columns, and plan summaries all use the same format.
 */

/** Short display name for an eval job: "eval-f05e2c" */
export function evalJobDisplayName(jobId: string): string {
  return `eval-${jobId.slice(0, 6)}`;
}

/** Short display name for a finetune job: uses suffix if available, otherwise "ft-abc123" */
export function finetuneJobDisplayName(jobId: string, suffix?: string): string {
  return suffix || `ft-${jobId.slice(0, 6)}`;
}
