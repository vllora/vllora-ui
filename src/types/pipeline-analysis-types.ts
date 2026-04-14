/**
 * Pipeline Section Analysis Types
 *
 * Shared analysis format between the finetune skill (agent) and the UI (user).
 * The agent writes this after each pipeline step. The UI displays it verbatim.
 * The agent reads it back when resuming. Both parties see the same insight.
 *
 * This is the CLAUDE.md pattern applied to runtime state — one document,
 * written by the agent, read by both, authoritative for decisions.
 */

// =============================================================================
// Section Analysis
// =============================================================================

export type SectionStatus = "not-started" | "in-progress" | "ready" | "needs-work" | "blocked";

export type SectionId =
  | "sources"
  | "trace-analysis"
  | "training-data"
  | "evaluator"
  | "evaluation"
  | "training";

/** Analysis for one pipeline section. Written by agent, displayed by UI. */
export interface SectionAnalysis {
  /** Current status of this section */
  readonly status: SectionStatus;
  /** One-line summary — the primary insight both agent and user see */
  readonly summary: string;
  /** Key metrics for programmatic access (agent reads these for decisions) */
  readonly metrics: Record<string, number | string | boolean>;
  /** Plain-language assessment — the agent's interpretation of what the data means */
  readonly assessment: string;
  /** What's blocking progress (empty = nothing blocked) */
  readonly blockers: readonly string[];
  /** What should happen next — both agent and user agree on this */
  readonly nextAction: string;
  /** When this section was last analyzed */
  readonly updatedAt: string;
}

// =============================================================================
// Full Analysis Document
// =============================================================================

/** The complete pipeline analysis — one block per section. */
export interface PipelineAnalysis {
  readonly version: "1.0";
  readonly workflowId: string;
  readonly sections: Partial<Record<SectionId, SectionAnalysis>>;
}
