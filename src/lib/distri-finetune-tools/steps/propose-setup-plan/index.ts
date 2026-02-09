/**
 * Propose Setup Plan
 *
 * Analyzes dataset objective and knowledge sources to propose a complete
 * setup plan for first-time users. The plan includes topic hierarchy,
 * data generation strategy, grader configuration, and execution steps.
 *
 * This is the first step in the guided onboarding flow.
 */

// Re-export types
export type {
  ProposeSetupPlanParams,
  ProposedTopic,
  GraderCriterion,
  SetupPlan,
  ProposeSetupPlanResult,
} from './types';

// Re-export handler
export { proposeSetupPlanHandler } from './handler';

// Re-export tool
export { proposeSetupPlanTool } from './tool';

// Re-export adjust plan tool
export { adjustSetupPlanHandler, adjustSetupPlanTool } from './adjust-plan';

// Re-export utilities for use by other modules
export { generateGraderTemplate } from './grader-template';
export { callLLMForPlan, fetchLucyConfigCached } from './llm-service';
