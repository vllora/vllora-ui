/**
 * Display name helpers for eval and finetune jobs.
 *
 * Centralized so the sidebar, table columns, and plan summaries all use the same format.
 */

/** Short display name for an eval job: "eval-f05e2c" */
export function evalJobDisplayName(jobId: string): string {
  return `eval-${jobId.slice(0, 6)}`;
}

/**
 * Base model prefixes used for pre/post-training baseline evaluation.
 * These match the "Base Models" group in NewEvaluationDialog's ROLLOUT_MODEL_OPTIONS.
 */
const BASE_MODEL_PREFIXES = ["Qwen", "Llama", "Mistral", "Gemma"] as const;

/** Check whether a rollout model is a base model (vs an eval/API model like GPT-4o) */
export function isBaseModel(rolloutModel: string | undefined): boolean {
  if (!rolloutModel) return false;
  return BASE_MODEL_PREFIXES.some((prefix) => rolloutModel.startsWith(prefix));
}

/** Short display name for a finetune job: uses suffix if available, otherwise "ft-abc123" */
export function finetuneJobDisplayName(jobId: string, suffix?: string): string {
  return suffix || `ft-${jobId.slice(0, 6)}`;
}
