/**
 * Distri Finetune Tools
 *
 * Tools for the vLLora Finetune Agent integration.
 * Organized into two categories:
 * - Workflow Tools: Control the finetune workflow lifecycle (start, status, advance, rollback)
 * - Step Tools: Execute individual steps (topics, categorize, coverage, grader, etc.)
 */

import type { DistriFnTool } from '@distri/core';

// Import from subdirectories
import {
  workflowTools,
  workflowToolHandlers,
  WORKFLOW_TOOL_NAMES,
  isWorkflowTool,
  type WorkflowToolName,
} from './workflow';

import {
  stepTools,
  stepToolHandlers,
  STEP_TOOL_NAMES,
  isStepTool,
  type StepToolName,
} from './steps';

// Re-export types
export type {
  ToolHandler,
  FinetuneContext,
  StartWorkflowResult,
  WorkflowStatusResult,
  AdvanceStepResult,
  RollbackResult,
  ValidateRecordsResult,
  GenerateTopicsResult,
  ApplyHierarchyResult,
  CategorizeRecordsResult,
  AnalyzeCoverageResult,
  GenerateDataResult,
  ConfigureGraderResult,
  TestGraderResult,
  DryRunResult,
  StartTrainingResult,
  TrainingStatusResult,
  DeployModelResult,
  GetDatasetRecordsResult,
  DatasetStatsResult,
} from './types';

export { workflowToContext, workflowToStatusResult } from './types';

// Re-export workflow DB types for convenience
export type {
  FinetuneWorkflowState,
  FinetuneStep,
  StepStatus,
  GenerationStrategy,
  DryRunVerdict,
} from '@/services/finetune-workflow-db';

export { finetuneWorkflowService } from '@/services/finetune-workflow-db';

// =============================================================================
// Combined Tool Handlers
// =============================================================================

export const finetuneToolHandlers: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  ...workflowToolHandlers,
  ...stepToolHandlers,
};

// =============================================================================
// Tool Name Constants
// =============================================================================

export const FINETUNE_TOOL_NAMES = [
  ...WORKFLOW_TOOL_NAMES,
  ...STEP_TOOL_NAMES,
] as const;

export type FinetuneToolName = WorkflowToolName | StepToolName;

// =============================================================================
// Tool Type Checkers
// =============================================================================

export function isFinetuneTool(toolName: string): toolName is FinetuneToolName {
  return isWorkflowTool(toolName) || isStepTool(toolName);
}

// Re-export individual type checkers
export { isWorkflowTool, isStepTool };

// =============================================================================
// Execute Tool
// =============================================================================

/**
 * Execute a finetune tool by name
 */
export async function executeFinetuneTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = finetuneToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown finetune tool: ${toolName}`);
  }
  return handler(params);
}

// =============================================================================
// DistriFnTool[] Arrays
// =============================================================================

// Individual tool arrays for selective use
export { workflowTools, stepTools };

// Combined array of all finetune tools
export const finetuneTools: DistriFnTool[] = [
  ...workflowTools,
  ...stepTools,
];

// =============================================================================
// Tool Names for Agent Definition
// =============================================================================

/**
 * All external tools available to the vllora_finetune_agent
 */
export const FINETUNE_AGENT_TOOLS = FINETUNE_TOOL_NAMES;

// =============================================================================
// Default Export
// =============================================================================

export default {
  tools: finetuneTools,
  handlers: finetuneToolHandlers,
  execute: executeFinetuneTool,
  isFinetuneTool,
};
