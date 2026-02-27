/**
 * Types for Plan system
 *
 * The agent writes ALL plan content as markdown (plan_markdown).
 * The frontend is a pure markdown renderer — no template assembly.
 */

import type { ExecutionStepId } from '../execute-plan';

export interface OutputFormat {
  schema: Record<string, unknown>;
  system_prompt_template: string;
}

export interface ProposePlanParams {
  dataset_id: string;
  /** The plan to propose. Lucy constructs this. */
  plan: Plan;
}

export interface ProposedTopic {
  name: string;
  description: string;
  target_count: number;
  subtopics?: ProposedTopic[];
  /** Composite refs to knowledge source chunks: "sourceId:chunkId" */
  source_chunk_refs?: string[];
}

export interface GraderCriterion {
  name: string;
  description: string;
}

// =============================================================================
// Dynamic Execution Steps
// =============================================================================

/** @deprecated Agent drives execution directly; these are no longer needed */
export type DynamicStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** @deprecated Agent drives execution directly via individual tool calls */
export interface DynamicExecutionStep {
  id: string;
  label: string;
  tool_name: string;
  tool_params: Record<string, unknown>;
  depends_on?: string[];
  status: DynamicStepStatus;
  details?: string[];
  error?: string;
}

// =============================================================================
// Plan
// =============================================================================

/** @deprecated All plans are agent-driven now; plan_type is ignored */
export type PlanType = 'finetune' | 'generic';

export interface Plan {
  dataset_id: string;
  dataset_name: string;
  objective: string;

  // Plan metadata
  title?: string;
  description?: string;

  // REQUIRED: Agent-authored markdown — the single source of rendering truth.
  // The frontend renders this directly. Agent updates it during execution
  // to check off completed steps.
  plan_markdown: string;

  /** @deprecated Ignored — all plans are agent-driven now */
  plan_type?: PlanType;

  /** @deprecated Agent drives execution directly via individual tool calls */
  dynamic_steps?: DynamicExecutionStep[];

  // --- Finetune data fields (still used by individual tool handlers) ---

  /** @deprecated Agent calls tools directly instead of execute_plan */
  steps_to_execute?: ExecutionStepId[];
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };

  /** Natural language instruction for adjust_topics step */
  adjust_topics_instruction?: string;

  // Structured output schema (null for free-form/conversational responses)
  output_format?: OutputFormat | null;

  // Knowledge sources analysis
  knowledge_sources?: {
    name: string;
    section_headings: string[];
  }[];

  // Proposed topic hierarchy (used by topic tools)
  proposed_topics?: ProposedTopic[];
  total_topic_count?: number;

  // Data generation plan (used by generation tools)
  data_generation?: {
    strategy: string;
    grounded_in_knowledge: boolean;
  };

  // Grader configuration (used by grader tools)
  grader_config?: {
    criteria: GraderCriterion[];
    template_preview?: string;
  };

  /** @deprecated Agent writes checklist in plan_markdown instead */
  execution_steps?: {
    step: string;
    description: string;
    estimated_time: string;
    step_id?: string;
  }[];

  // Estimated totals
  estimated_records?: number;
  /** @deprecated Agent includes estimates in plan_markdown */
  estimated_duration?: string;
}

export interface ProposePlanResult {
  success: boolean;
  error?: string;
  plan?: Plan;
  message?: string;
}
