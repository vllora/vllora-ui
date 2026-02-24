/**
 * Types for Propose plan
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

export interface Plan {
  dataset_id: string;
  dataset_name: string;
  objective: string;

  // Plan metadata
  title?: string;
  description?: string;

  // Execution config embedded in plan
  steps_to_execute?: ExecutionStepId[];
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };

  /** Natural language instruction for adjust_topics step */
  adjust_topics_instruction?: string;

  // Structured output schema (null for free-form/conversational responses)
  // Optional: only present for plans that touch output format
  output_format?: OutputFormat | null;

  // Knowledge sources analysis
  // Optional: only present for plans that analyze knowledge sources
  knowledge_sources?: {
    name: string;
    section_headings: string[];
  }[];

  // Proposed topic hierarchy
  // Optional: only present for plans that configure topics
  proposed_topics?: ProposedTopic[];
  total_topic_count?: number;

  // Data generation plan
  // Optional: only present for plans that generate data
  data_generation?: {
    strategy: string;
    grounded_in_knowledge: boolean;
  };

  // Grader configuration
  // Optional: only present for plans that configure grader
  grader_config?: {
    criteria: GraderCriterion[];
    template_preview?: string;  // only generated at execution time, not stored in proposal
  };

  // Execution steps (what the user sees)
  execution_steps: {
    step: string;
    description: string;
    estimated_time: string;
  }[];

  // Estimated totals
  estimated_records?: number;
  estimated_duration: string;
}

export interface ProposePlanResult {
  success: boolean;
  error?: string;
  plan?: Plan;
  message?: string;
}
