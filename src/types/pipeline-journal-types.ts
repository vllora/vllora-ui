/**
 * Pipeline Journal Types
 *
 * Typed definitions for the structured pipeline execution journal.
 * Maps to the `pipeline_journal` JSON blob stored on the workflow row.
 *
 * Schema reference: finetune-skill/reference/pipeline-journal-schema.md
 */

// =============================================================================
// Journal Entry
// =============================================================================

export type JournalEntryStatus =
  | "in_progress"
  | "completed"
  | "pass"
  | "fail"
  | "warn"
  | "succeeded"
  | "error";

export type JournalJobType = "eval" | "training";

/** Structured results for eval entries */
export interface JournalEvalResults {
  readonly avg_score?: number;
  readonly zero_rate?: number;
  readonly perfect_rate?: number;
  readonly total_rows?: number;
  readonly per_topic_weakest?: readonly string[];
}

/** Structured results for training entries */
export interface JournalTrainingResults {
  readonly fine_tuned_model?: string;
  readonly early_stop_reason?: string | null;
  readonly error_message?: string | null;
}

export interface PipelineJournalEntry {
  readonly id: number;
  readonly timestamp: string;
  readonly step: string;
  readonly action: string;
  readonly status: JournalEntryStatus;
  readonly summary: string;
  readonly analysis?: string;
  readonly decision?: string;
  readonly reason_created?: string;
  readonly duration?: string;
  readonly agent?: string;
  readonly job_id?: string;
  readonly job_type?: JournalJobType;
  readonly model?: string;
  readonly results?: JournalEvalResults | JournalTrainingResults | Record<string, unknown>;
  readonly details?: Record<string, unknown>;
  readonly auto_logged?: boolean;
  readonly triggered_by?: number;
  readonly triggers_next?: number;
}

// =============================================================================
// Journal Root
// =============================================================================

export interface PipelineJournal {
  readonly version: string;
  readonly workflow_id: string;
  readonly objective?: string;
  readonly entries: readonly PipelineJournalEntry[];
}
