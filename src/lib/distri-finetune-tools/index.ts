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

import {
  todosTools,
  isTodosTool,
  type TodoItem,
  type TodoStatus,
} from './todos';

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
  EvalRunResult,
  StartTrainingResult,
  TrainingStatusResult,
  DeployModelResult,
  GetDatasetRecordsResult,
  DatasetStatsResult,
} from './types';

export type { GetTrainingMetricsResult } from './steps/get-training-metrics';

export { workflowToContext, workflowToStatusResult } from './types';

// Re-export workflow DB types for convenience
export type {
  FinetuneWorkflowState,
  FinetuneStep,
  StepStatus,
  GenerationStrategy,
  DryRunVerdict,
} from '@/types/workflow-types';

export { workflowService } from '@/services/service-registry';

// =============================================================================
// Combined Tool Handlers
// =============================================================================

export const finetuneToolHandlers: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  ...workflowToolHandlers,
  ...stepToolHandlers,
  // Note: todosToolHandlers not included - write_todos is a builtin tool handled by server
};

// =============================================================================
// Tool Name Constants
// =============================================================================

// Note: TODOS_TOOL_NAMES not included - write_todos is a builtin tool handled by server
export const FINETUNE_TOOL_NAMES = [
  ...WORKFLOW_TOOL_NAMES,
  ...STEP_TOOL_NAMES,
] as const;

export type FinetuneToolName = WorkflowToolName | StepToolName;

// =============================================================================
// Tool Type Checkers
// =============================================================================

export function isFinetuneTool(toolName: string): toolName is FinetuneToolName {
  // Note: isTodosTool not checked - write_todos is a builtin tool handled by server
  return isWorkflowTool(toolName) || isStepTool(toolName);
}

// Re-export individual type checkers
export { isWorkflowTool, isStepTool, isTodosTool };

// Re-export todos types
export type { TodoItem, TodoStatus };

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
export { workflowTools, stepTools, todosTools };

// Combined array of all finetune tools
// Note: write_todos is NOT included here because it's a builtin tool
// handled by the distri server (not an external tool)
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
