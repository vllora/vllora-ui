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

// Sync Evaluator (update grader without re-uploading)
export { syncEvaluatorHandler, syncEvaluatorTool } from './sync-evaluator';

// Evaluation (Step 5)
export { runEvaluationHandler, runEvaluationTool } from './run-evaluation';

// Skill Packaging (between Dry Run and Training)
export { generateSkillPackageHandler, generateSkillPackageTool } from './generate-skill-package';
export { downloadSkillPackageHandler, downloadSkillPackageTool } from './download-skill-package';

// Training (Step 6)
export { startTrainingHandler, startTrainingTool } from './start-training';
export { checkTrainingStatusHandler, checkTrainingStatusTool } from './check-training-status';

// Deployment (Step 7)
export { deployModelHandler, deployModelTool } from './deploy-model';

// Data Access
export { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-workflow-records';
export { getDatasetStateHandler, getDatasetStateTool, computeDatasetStats, type DatasetState } from './get-workflow-state';
export { updateRecordHandler, updateRecordTool } from './update-record';

// README
export { updateDatasetReadmeHandler, updateDatasetReadmeTool } from './update-workflow-readme';

// Objective
export { updateObjectiveHandler, updateObjectiveTool } from './update-objective';

// Dataset Creation
export { createDatasetHandler, createDatasetTool } from './create-dataset';

// Evaluation Analysis (Phase 1: Give Lucy Eyes)
export { getEvaluationDetailsHandler, getEvaluationDetailsTool } from './get-evaluation-details';
export { logIterationHandler, logIterationTool, getIterationHistoryHandler, getIterationHistoryTool } from './iteration-history';
export { markJobReviewedHandler, markJobReviewedTool } from './mark-job-reviewed';

// Evaluation Analysis (Phase 2: Give Lucy Autonomy)
export { analyzeEvaluationHandler, analyzeEvaluationTool } from './analyze-evaluation';

// Training Analysis (Phase 3: Give Lucy Wisdom)
export { analyzeTrainingHandler, analyzeTrainingTool } from './analyze-training';

// Training Metrics (Phase 3B: Raw training telemetry)
export { getTrainingMetricsHandler, getTrainingMetricsTool, type GetTrainingMetricsResult } from './get-training-metrics';

// Task Viability Pre-Check (Phase 4B)
export { checkViabilityHandler, checkViabilityTool } from './check-viability';

// Semantic PDF Extraction (local, in-browser) — internal function, not an agent tool
export { extractPdfContentLocal } from './semantic-pdf-extractor';

// Knowledge Source Analysis
export { analyzeKnowledgeSourcesHandler, analyzeKnowledgeSourcesTool } from './analyze-knowledge-sources';

// Grader Generation (LLM-based criteria + script generation)
export { generateGraderHandler, generateGraderTool } from './generate-grader';

// Plan System (propose → save → approve → execute)
export { proposePlanHandler, proposePlanTool, type Plan } from './propose-plan';
export { adjustPlanHandler, adjustPlanTool } from './propose-plan';
export { savePlanHandler, savePlanTool } from './save-plan';
export {
  executePlanHandler,
  executePlanTool,
  type ExecutionProgress,
  type ExecutionStep,
  type ExecutionStepStatus,
  type ExecutionStepId,
} from './execute-plan';
export { updatePlanMarkdownHandler, updatePlanMarkdownTool } from './update-plan-markdown';

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
import { syncEvaluatorHandler, syncEvaluatorTool } from './sync-evaluator';
import { runEvaluationHandler, runEvaluationTool } from './run-evaluation';
import { generateSkillPackageHandler, generateSkillPackageTool } from './generate-skill-package';
import { downloadSkillPackageHandler, downloadSkillPackageTool } from './download-skill-package';
import { startTrainingHandler, startTrainingTool } from './start-training';
import { checkTrainingStatusHandler, checkTrainingStatusTool } from './check-training-status';
import { deployModelHandler, deployModelTool } from './deploy-model';
import { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-workflow-records';
import { getDatasetStateHandler, getDatasetStateTool } from './get-workflow-state';
import { updateRecordHandler, updateRecordTool } from './update-record';
import { updateDatasetReadmeHandler, updateDatasetReadmeTool } from './update-workflow-readme';
import { updateObjectiveHandler, updateObjectiveTool } from './update-objective';
import { analyzeKnowledgeSourcesHandler, analyzeKnowledgeSourcesTool } from './analyze-knowledge-sources';
import { generateGraderHandler, generateGraderTool } from './generate-grader';
import { proposePlanHandler, proposePlanTool, adjustPlanHandler, adjustPlanTool } from './propose-plan';
import { savePlanHandler, savePlanTool } from './save-plan';
import { executePlanHandler, executePlanTool } from './execute-plan';
import { updatePlanMarkdownHandler, updatePlanMarkdownTool } from './update-plan-markdown';
import { createDatasetHandler, createDatasetTool } from './create-dataset';
import { getEvaluationDetailsHandler, getEvaluationDetailsTool } from './get-evaluation-details';
import { logIterationHandler, logIterationTool, getIterationHistoryHandler, getIterationHistoryTool } from './iteration-history';
import { markJobReviewedHandler, markJobReviewedTool } from './mark-job-reviewed';
import { analyzeEvaluationHandler, analyzeEvaluationTool } from './analyze-evaluation';
import { analyzeTrainingHandler, analyzeTrainingTool } from './analyze-training';
import { getTrainingMetricsHandler, getTrainingMetricsTool } from './get-training-metrics';
import { checkViabilityHandler, checkViabilityTool } from './check-viability';
// Note: Stockfish tools (analyzeChessPositionTool, classifyChessMoveTool) are NOT imported here
// They are conditionally added via stockfishTools in useFineTuneAgentChat for chess datasets only

// =============================================================================
// Tool Names and Aggregated Exports
// =============================================================================

export const STEP_TOOL_NAMES = [
  'suggest_topics',
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
  'sync_evaluator',
  'run_evaluation',
  'generate_skill_package',
  'download_skill_package',
  'start_training',
  'check_training_status',
  'deploy_model',
  'get_workflow_records',
  'get_workflow_state',
  'update_record',
  'update_workflow_readme',
  'update_objective',
  'analyze_knowledge_sources',
  'suggest_grader',
  'propose_plan',
  'adjust_plan',
  'save_plan',
  'execute_plan',
  'update_plan_markdown',
  'create_dataset',
  // Evaluation Analysis (Phase 1: Give Lucy Eyes)
  'get_evaluation_details',
  'log_iteration',
  'get_iteration_history',
  'mark_job_reviewed',
  // Evaluation Analysis (Phase 2: Give Lucy Autonomy)
  'analyze_evaluation',
  // Training Analysis (Phase 3: Give Lucy Wisdom)
  'analyze_training',
  // Training Metrics (Phase 3B: Raw training telemetry)
  'get_training_metrics',
  // Task Viability Pre-Check (Phase 4B)
  'check_viability',
  // Note: Stockfish tools ('analyze_chess_position', 'classify_chess_move') are NOT in this list
  // They are conditionally available for chess datasets only via stockfishTools export
] as const;

export type StepToolName = (typeof STEP_TOOL_NAMES)[number];

export function isStepTool(name: string): name is StepToolName {
  return STEP_TOOL_NAMES.includes(name as StepToolName);
}

// All step tools auto-execute without user confirmation — they run locally
// in the browser (IndexedDB reads/writes, local computation) and the user
// has already opted in to using the Lucy agent.
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
  syncEvaluatorTool,
  runEvaluationTool,
  generateSkillPackageTool,
  downloadSkillPackageTool,
  startTrainingTool,
  checkTrainingStatusTool,
  deployModelTool,
  getDatasetRecordsTool,
  getDatasetStateTool,
  updateRecordTool,
  updateDatasetReadmeTool,
  updateObjectiveTool,
  analyzeKnowledgeSourcesTool,
  generateGraderTool,
  proposePlanTool,
  adjustPlanTool,
  savePlanTool,
  executePlanTool,
  updatePlanMarkdownTool,
  createDatasetTool,
  // Evaluation Analysis (Phase 1: Give Lucy Eyes)
  getEvaluationDetailsTool,
  logIterationTool,
  getIterationHistoryTool,
  markJobReviewedTool,
  // Evaluation Analysis (Phase 2: Give Lucy Autonomy)
  analyzeEvaluationTool,
  // Training Analysis (Phase 3: Give Lucy Wisdom)
  analyzeTrainingTool,
  // Training Metrics (Phase 3B: Raw training telemetry)
  getTrainingMetricsTool,
  // Task Viability Pre-Check (Phase 4B)
  checkViabilityTool,
  // Note: Stockfish tools are NOT included here - they are conditionally added
  // via stockfishTools in useFineTuneAgentChat for chess datasets only
].map(tool => ({ ...tool, autoExecute: true }));

export const stepToolHandlers: Record<string, ToolHandler> = {
  suggest_topics: generateTopicsHandler,
  apply_topic_hierarchy: applyTopicHierarchyHandler,
  adjust_topic_hierarchy: adjustTopicHierarchyHandler,
  get_topic_hierarchy: getTopicHierarchyHandler,
  categorize_records: categorizeRecordsHandler,
  analyze_coverage: analyzeCoverageHandler,
  generate_synthetic_data: generateSyntheticDataHandler,
  generate_initial_data: async (params) => {
    const { maybeUseMockHandler } = await import(
      '@/test/mock-data/mock-generate-initial-data'
    );
    return maybeUseMockHandler(generateInitialDataHandler, params);
  },
  generate_record_variants: generateRecordVariantsHandler,
  generate_preview: generatePreviewHandler,
  upload_knowledge_source: uploadKnowledgeSourceHandler,
  list_knowledge_sources: listKnowledgeSourcesHandler,
  extract_topics_from_source: extractTopicsFromSourceHandler,
  search_knowledge: searchKnowledgeHandler,
  configure_grader: configureGraderHandler,
  validate_records: validateRecordsHandler,
  test_grader_sample: testGraderSampleHandler,
  sync_evaluator: syncEvaluatorHandler,
  run_evaluation: runEvaluationHandler,
  generate_skill_package: generateSkillPackageHandler,
  download_skill_package: downloadSkillPackageHandler,
  start_training: startTrainingHandler,
  check_training_status: checkTrainingStatusHandler,
  deploy_model: deployModelHandler,
  get_workflow_records: getDatasetRecordsHandler,
  get_workflow_state: getDatasetStateHandler,
  update_record: updateRecordHandler,
  update_workflow_readme: updateDatasetReadmeHandler,
  update_objective: updateObjectiveHandler,
  analyze_knowledge_sources: analyzeKnowledgeSourcesHandler,
  suggest_grader: generateGraderHandler,
  propose_plan: proposePlanHandler,
  adjust_plan: adjustPlanHandler,
  save_plan: savePlanHandler,
  execute_plan: executePlanHandler,
  update_plan_markdown: updatePlanMarkdownHandler,
  create_dataset: createDatasetHandler,
  // Evaluation Analysis (Phase 1: Give Lucy Eyes)
  get_evaluation_details: getEvaluationDetailsHandler,
  log_iteration: logIterationHandler,
  get_iteration_history: getIterationHistoryHandler,
  mark_job_reviewed: markJobReviewedHandler,
  // Evaluation Analysis (Phase 2: Give Lucy Autonomy)
  analyze_evaluation: analyzeEvaluationHandler,
  // Training Analysis (Phase 3: Give Lucy Wisdom)
  analyze_training: analyzeTrainingHandler,
  // Training Metrics (Phase 3B: Raw training telemetry)
  get_training_metrics: getTrainingMetricsHandler,
  // Task Viability Pre-Check (Phase 4B)
  check_viability: checkViabilityHandler,
  // Note: Stockfish handlers are in stockfishToolHandlers export, not here
};
