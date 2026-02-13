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
export { adjustTopicHierarchyHandler, adjustTopicHierarchyTool } from './adjust-hierarchy';
export { getTopicHierarchyHandler, getTopicHierarchyTool } from './topic-manipulation';

// Categorization (Step 2)
export { categorizeRecordsHandler, categorizeRecordsTool } from './categorize-records';

// Coverage & Generation (Step 3)
export { analyzeCoverageHandler, analyzeCoverageTool } from './analyze-coverage';
export { generateSyntheticDataHandler, generateSyntheticDataTool } from './generate-synthetic';
export { generateInitialDataHandler, generateInitialDataTool } from './generate-initial-data';
export { generateRecordVariantsHandler, generateRecordVariantsTool } from './generate-record-variants';
export { generatePreviewHandler, generatePreviewTool } from './generate-preview';

// Knowledge Sources (for grounded data generation)
export {
  uploadKnowledgeSourceHandler,
  uploadKnowledgeSourceTool,
  listKnowledgeSourcesHandler,
  listKnowledgeSourcesTool,
  extractTopicsFromSourceHandler,
  extractTopicsFromSourceTool,
  searchKnowledgeHandler,
  searchKnowledgeTool,
  knowledgeSourceTools,
} from './knowledge-sources';

// Grader Configuration (Step 4)
export { configureGraderHandler, configureGraderTool } from './configure-grader';
export { testGraderSampleHandler, testGraderSampleTool } from './test-grader';

// Validation
export { validateRecordsHandler, validateRecordsTool } from './validate-records';

// Upload Dataset (before dry run)
export { uploadDatasetHandler, uploadDatasetTool } from './upload-dataset';

// Sync Evaluator (update grader without re-uploading)
export { syncEvaluatorHandler, syncEvaluatorTool } from './sync-evaluator';

// Dry Run (Step 5)
export { runDryRunHandler, runDryRunTool } from './run-dry-run';

// Training (Step 6)
export { startTrainingHandler, startTrainingTool } from './start-training';
export { checkTrainingStatusHandler, checkTrainingStatusTool } from './check-training-status';

// Deployment (Step 7)
export { deployModelHandler, deployModelTool } from './deploy-model';

// Data Access
export { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-dataset-records';
export { getDatasetStateHandler, getDatasetStateTool, computeDatasetStats, type DatasetState } from './get-dataset-state';
export { updateRecordHandler, updateRecordTool } from './update-record';

// README
export { regenerateReadmeHandler, regenerateReadmeTool } from './regenerate-readme';

// Knowledge Source Analysis
export { analyzeKnowledgeSourcesHandler, analyzeKnowledgeSourcesTool } from './analyze-knowledge-sources';

// Grader Generation (LLM-based criteria + script generation)
export { generateGraderHandler, generateGraderTool } from './generate-grader';

// Plan System (propose → approve → execute)
export { proposeSetupPlanHandler, proposeSetupPlanTool, type SetupPlan } from './propose-setup-plan';
export { adjustSetupPlanHandler, adjustSetupPlanTool } from './propose-setup-plan';
export {
  executeSetupPlanHandler,
  executeSetupPlanTool,
  type ExecutionProgress,
  type ExecutionStep,
  type ExecutionStepStatus,
  type ExecutionStepId,
} from './execute-setup-plan';

// Stockfish Chess Analysis (conditionally used for chess datasets only)
export {
  analyzeChessPositionHandler,
  analyzeChessPositionTool,
  classifyChessMoveHandler,
  classifyChessMoveTool,
  stockfishTools,
  stockfishToolHandlers,
  isChessDataset,
  STOCKFISH_TOOL_NAMES,
  type StockfishToolName,
} from './stockfish-tools';

// Re-export helpers
export * from './helpers';

// =============================================================================
// Import tools for aggregation
// =============================================================================

import { generateTopicsHandler, generateTopicsTool } from './generate-topics';
import { applyTopicHierarchyHandler, applyTopicHierarchyTool } from './apply-hierarchy';
import { adjustTopicHierarchyHandler, adjustTopicHierarchyTool } from './adjust-hierarchy';
import { getTopicHierarchyHandler, getTopicHierarchyTool } from './topic-manipulation';
import { categorizeRecordsHandler, categorizeRecordsTool } from './categorize-records';
import { analyzeCoverageHandler, analyzeCoverageTool } from './analyze-coverage';
import { generateSyntheticDataHandler, generateSyntheticDataTool } from './generate-synthetic';
import { generateInitialDataHandler, generateInitialDataTool } from './generate-initial-data';
import { generateRecordVariantsHandler, generateRecordVariantsTool } from './generate-record-variants';
import { generatePreviewHandler, generatePreviewTool } from './generate-preview';
import {
  uploadKnowledgeSourceHandler,
  uploadKnowledgeSourceTool,
  listKnowledgeSourcesHandler,
  listKnowledgeSourcesTool,
  extractTopicsFromSourceHandler,
  extractTopicsFromSourceTool,
  searchKnowledgeHandler,
  searchKnowledgeTool,
} from './knowledge-sources';
import { configureGraderHandler, configureGraderTool } from './configure-grader';
import { testGraderSampleHandler, testGraderSampleTool } from './test-grader';
import { validateRecordsHandler, validateRecordsTool } from './validate-records';
import { uploadDatasetHandler, uploadDatasetTool } from './upload-dataset';
import { syncEvaluatorHandler, syncEvaluatorTool } from './sync-evaluator';
import { runDryRunHandler, runDryRunTool } from './run-dry-run';
import { startTrainingHandler, startTrainingTool } from './start-training';
import { checkTrainingStatusHandler, checkTrainingStatusTool } from './check-training-status';
import { deployModelHandler, deployModelTool } from './deploy-model';
import { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-dataset-records';
import { getDatasetStateHandler, getDatasetStateTool } from './get-dataset-state';
import { updateRecordHandler, updateRecordTool } from './update-record';
import { regenerateReadmeHandler, regenerateReadmeTool } from './regenerate-readme';
import { analyzeKnowledgeSourcesHandler, analyzeKnowledgeSourcesTool } from './analyze-knowledge-sources';
import { generateGraderHandler, generateGraderTool } from './generate-grader';
import { proposeSetupPlanHandler, proposeSetupPlanTool, adjustSetupPlanHandler, adjustSetupPlanTool } from './propose-setup-plan';
import { executeSetupPlanHandler, executeSetupPlanTool } from './execute-setup-plan';
// Note: Stockfish tools (analyzeChessPositionTool, classifyChessMoveTool) are NOT imported here
// They are conditionally added via stockfishTools in useFineTuneAgentChat for chess datasets only

// =============================================================================
// Tool Names and Aggregated Exports
// =============================================================================

export const STEP_TOOL_NAMES = [
  'generate_topics',
  'apply_topic_hierarchy',
  'adjust_topic_hierarchy',
  'get_topic_hierarchy',
  'categorize_records',
  'analyze_coverage',
  'generate_synthetic_data',
  'generate_initial_data',
  'generate_record_variants',
  'generate_preview',
  'upload_knowledge_source',
  'list_knowledge_sources',
  'extract_topics_from_source',
  'search_knowledge',
  'configure_grader',
  'validate_records',
  'test_grader_sample',
  'upload_dataset',
  'sync_evaluator',
  'run_dry_run',
  'start_training',
  'check_training_status',
  'deploy_model',
  'get_dataset_records',
  'get_dataset_state',
  'update_record',
  'regenerate_readme',
  'analyze_knowledge_sources',
  'generate_grader',
  'propose_setup_plan',
  'adjust_setup_plan',
  'execute_setup_plan',
  // Note: Stockfish tools ('analyze_chess_position', 'classify_chess_move') are NOT in this list
  // They are conditionally available for chess datasets only via stockfishTools export
] as const;

export type StepToolName = (typeof STEP_TOOL_NAMES)[number];

export function isStepTool(name: string): name is StepToolName {
  return STEP_TOOL_NAMES.includes(name as StepToolName);
}

export const stepTools: DistriFnTool[] = [
  generateTopicsTool,
  applyTopicHierarchyTool,
  adjustTopicHierarchyTool,
  getTopicHierarchyTool,
  categorizeRecordsTool,
  analyzeCoverageTool,
  generateSyntheticDataTool,
  generateInitialDataTool,
  generateRecordVariantsTool,
  generatePreviewTool,
  uploadKnowledgeSourceTool,
  listKnowledgeSourcesTool,
  extractTopicsFromSourceTool,
  searchKnowledgeTool,
  configureGraderTool,
  validateRecordsTool,
  testGraderSampleTool,
  uploadDatasetTool,
  syncEvaluatorTool,
  runDryRunTool,
  startTrainingTool,
  checkTrainingStatusTool,
  deployModelTool,
  getDatasetRecordsTool,
  getDatasetStateTool,
  updateRecordTool,
  regenerateReadmeTool,
  analyzeKnowledgeSourcesTool,
  generateGraderTool,
  proposeSetupPlanTool,
  adjustSetupPlanTool,
  executeSetupPlanTool,
  // Note: Stockfish tools are NOT included here - they are conditionally added
  // via stockfishTools in useFineTuneAgentChat for chess datasets only
];

export const stepToolHandlers: Record<string, ToolHandler> = {
  generate_topics: generateTopicsHandler,
  apply_topic_hierarchy: applyTopicHierarchyHandler,
  adjust_topic_hierarchy: adjustTopicHierarchyHandler,
  get_topic_hierarchy: getTopicHierarchyHandler,
  categorize_records: categorizeRecordsHandler,
  analyze_coverage: analyzeCoverageHandler,
  generate_synthetic_data: generateSyntheticDataHandler,
  generate_initial_data: generateInitialDataHandler,
  generate_record_variants: generateRecordVariantsHandler,
  generate_preview: generatePreviewHandler,
  upload_knowledge_source: uploadKnowledgeSourceHandler,
  list_knowledge_sources: listKnowledgeSourcesHandler,
  extract_topics_from_source: extractTopicsFromSourceHandler,
  search_knowledge: searchKnowledgeHandler,
  configure_grader: configureGraderHandler,
  validate_records: validateRecordsHandler,
  test_grader_sample: testGraderSampleHandler,
  upload_dataset: uploadDatasetHandler,
  sync_evaluator: syncEvaluatorHandler,
  run_dry_run: runDryRunHandler,
  start_training: startTrainingHandler,
  check_training_status: checkTrainingStatusHandler,
  deploy_model: deployModelHandler,
  get_dataset_records: getDatasetRecordsHandler,
  get_dataset_state: getDatasetStateHandler,
  update_record: updateRecordHandler,
  regenerate_readme: regenerateReadmeHandler,
  analyze_knowledge_sources: analyzeKnowledgeSourcesHandler,
  generate_grader: generateGraderHandler,
  propose_setup_plan: proposeSetupPlanHandler,
  adjust_setup_plan: adjustSetupPlanHandler,
  execute_setup_plan: executeSetupPlanHandler,
  // Note: Stockfish handlers are in stockfishToolHandlers export, not here
};
