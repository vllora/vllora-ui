/**
 * Types for Propose Setup Plan
 */

export interface ProposeSetupPlanParams {
  dataset_id: string;
  seed_count?: number;
}

export interface ProposedTopic {
  name: string;
  description: string;
  target_count: number;
  subtopics?: ProposedTopic[];
}

export interface GraderCriterion {
  name: string;
  description: string;
}

export interface SetupPlan {
  dataset_id: string;
  dataset_name: string;
  objective: string;

  // Knowledge sources analysis
  knowledge_sources: {
    name: string;
    topics_extracted: string[];
  }[];

  // Proposed topic hierarchy
  proposed_topics: ProposedTopic[];
  total_topic_count: number;

  // Data generation plan
  data_generation: {
    seed_count: number;
    strategy: string;
    grounded_in_knowledge: boolean;
  };

  // Grader configuration
  grader_config: {
    criteria: GraderCriterion[];
    template_preview: string;
  };

  // Execution steps
  execution_steps: {
    step: string;
    description: string;
    estimated_time: string;
  }[];

  // Estimated totals
  estimated_records: number;
  estimated_duration: string;
}

export interface ProposeSetupPlanResult {
  success: boolean;
  error?: string;
  plan?: SetupPlan;
  requires_knowledge_sources?: boolean;
  sources_processing?: boolean;
  message?: string;
}
