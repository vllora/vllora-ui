/**
 * Finetune Step Execution Tools
 *
 * Tools for executing individual steps in the finetune workflow.
 * Re-exports all tools from individual files.
 */

import type { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';

// =============================================================================
// Re-export individual tool modules
// =============================================================================

// Topic Configuration (Step 1)
export { generateTopicsHandler, generateTopicsTool } from './generate-topics';
export { applyTopicHierarchyHandler, applyTopicHierarchyTool } from './apply-hierarchy';

// Categorization (Step 2)
export { categorizeRecordsHandler, categorizeRecordsTool } from './categorize-records';

// Coverage & Generation (Step 3)
export { analyzeCoverageHandler, analyzeCoverageTool } from './analyze-coverage';
export { generateSyntheticDataHandler, generateSyntheticDataTool } from './generate-synthetic';

// Grader Configuration (Step 4)
export { configureGraderHandler, configureGraderTool } from './configure-grader';
export { testGraderSampleHandler, testGraderSampleTool } from './test-grader';

// Validation
export { validateRecordsHandler, validateRecordsTool } from './validate-records';

// Dry Run (Step 5)
export { runDryRunHandler, runDryRunTool } from './run-dry-run';

// Training (Step 6)
export { startTrainingHandler, startTrainingTool } from './start-training';
export { checkTrainingStatusHandler, checkTrainingStatusTool } from './check-training-status';

// Deployment (Step 7)
export { deployModelHandler, deployModelTool } from './deploy-model';

// Data Access
export { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-dataset-records';
export { getDatasetStatsHandler, getDatasetStatsTool } from './get-dataset-stats';
export { updateRecordHandler, updateRecordTool } from './update-record';

// Re-export helpers
export * from './helpers';

// =============================================================================
// Import tools for aggregation
// =============================================================================

import { generateTopicsHandler, generateTopicsTool } from './generate-topics';
import { applyTopicHierarchyHandler, applyTopicHierarchyTool } from './apply-hierarchy';
import { categorizeRecordsHandler, categorizeRecordsTool } from './categorize-records';
import { analyzeCoverageHandler, analyzeCoverageTool } from './analyze-coverage';
import { generateSyntheticDataHandler, generateSyntheticDataTool } from './generate-synthetic';
import { configureGraderHandler, configureGraderTool } from './configure-grader';
import { testGraderSampleHandler, testGraderSampleTool } from './test-grader';
import { validateRecordsHandler, validateRecordsTool } from './validate-records';
import { runDryRunHandler, runDryRunTool } from './run-dry-run';
import { startTrainingHandler, startTrainingTool } from './start-training';
import { checkTrainingStatusHandler, checkTrainingStatusTool } from './check-training-status';
import { deployModelHandler, deployModelTool } from './deploy-model';
import { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-dataset-records';
import { getDatasetStatsHandler, getDatasetStatsTool } from './get-dataset-stats';
import { updateRecordHandler, updateRecordTool } from './update-record';

// =============================================================================
// Tool Names and Aggregated Exports
// =============================================================================

export const STEP_TOOL_NAMES = [
  'generate_topics',
  'apply_topic_hierarchy',
  'categorize_records',
  'analyze_coverage',
  'generate_synthetic_data',
  'configure_grader',
  'validate_records',
  'test_grader_sample',
  'run_dry_run',
  'start_training',
  'check_training_status',
  'deploy_model',
  'get_dataset_records',
  'get_dataset_stats',
  'update_record',
] as const;

export type StepToolName = (typeof STEP_TOOL_NAMES)[number];

export function isStepTool(name: string): name is StepToolName {
  return STEP_TOOL_NAMES.includes(name as StepToolName);
}

export const stepTools: DistriFnTool[] = [
  generateTopicsTool,
  applyTopicHierarchyTool,
  categorizeRecordsTool,
  analyzeCoverageTool,
  generateSyntheticDataTool,
  configureGraderTool,
  validateRecordsTool,
  testGraderSampleTool,
  runDryRunTool,
  startTrainingTool,
  checkTrainingStatusTool,
  deployModelTool,
  getDatasetRecordsTool,
  getDatasetStatsTool,
  updateRecordTool,
];

export const stepToolHandlers: Record<string, ToolHandler> = {
  generate_topics: generateTopicsHandler,
  apply_topic_hierarchy: applyTopicHierarchyHandler,
  categorize_records: categorizeRecordsHandler,
  analyze_coverage: analyzeCoverageHandler,
  generate_synthetic_data: generateSyntheticDataHandler,
  configure_grader: configureGraderHandler,
  validate_records: validateRecordsHandler,
  test_grader_sample: testGraderSampleHandler,
  run_dry_run: runDryRunHandler,
  start_training: startTrainingHandler,
  check_training_status: checkTrainingStatusHandler,
  deploy_model: deployModelHandler,
  get_dataset_records: getDatasetRecordsHandler,
  get_dataset_stats: getDatasetStatsHandler,
  update_record: updateRecordHandler,
};
