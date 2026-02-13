/**
 * Propose Setup Plan
 *
 * Validates, persists, and displays a plan for user approval.
 * Lucy constructs the plan; this tool just shows it to the user.
 */

// Re-export types
export type {
  ProposeSetupPlanParams,
  ProposedTopic,
  GraderCriterion,
  SetupPlan,
  ProposeSetupPlanResult,
  OutputFormat,
} from './types';

// Re-export handler
export { proposeSetupPlanHandler } from './handler';

// Re-export tool
export { proposeSetupPlanTool } from './tool';

// Re-export adjust plan tool
export { adjustSetupPlanHandler, adjustSetupPlanTool } from './adjust-plan';

// Re-export utilities for use by other modules
export { generateGraderTemplate } from './grader-template';
