/**
 * Execute plan Tool
 *
 * Registry-based orchestrator. Each step is a registered executor.
 * The handler iterates plan.steps_to_execute and calls each executor.
 *
 * To add a new step: define an executor function, add it to STEP_REGISTRY.
 */

import type { DistriFnTool } from '@distri/core';
import { toast } from 'sonner';
import { emitter } from '@/utils/eventEmitter';
import { workflowService, datasetService, recordService } from '@/services/service-registry';
import type { FinetuneStep, StepStatus } from '@/types/workflow-types';
import type { ToolHandler } from '../types';
import { evalJobDisplayName, finetuneJobDisplayName } from '@/lib/job-display-name';
import type { Plan } from './propose-plan';
import type { TopicHierarchyNode } from '@/types/dataset-types';
// NOTE: executeFinetuneTool is imported lazily (dynamic import) inside
// executeDynamicSteps() to avoid a circular dependency:
//   execute-plan → ../index → ./steps/index → get-workflow-state → execute-plan

// Import step handlers
import { applyTopicHierarchyHandler } from './apply-hierarchy';
import { adjustTopicHierarchyHandler } from './adjust-hierarchy';
import { rollbackToStepHandler } from '../workflow/index';
import { categorizeRecordsHandler } from './categorize-records';
import { generateInitialDataHandler } from './generate-initial-data';

/** Mock-aware wrapper: uses mock handler when localStorage flag is set. */
async function callGenerateInitialData(params: Record<string, unknown>) {
  const { maybeUseMockHandler } = await import(
    '@/test/mock-data/mock-generate-initial-data'
  );
  return maybeUseMockHandler(generateInitialDataHandler, params);
}
import { runEvaluationHandler } from './run-evaluation';

// Import for finetune job creation (disabled)
// import { quickFinetune } from '@/services/quick-finetune';

// Import grader template generator
import { generateGraderTemplate } from './propose-plan/grader-template';

// Side-effect import to ensure execution state store is listening for progress events
import './execution-state-store';
import { isExecutionCancelled, clearCancellation } from './execution-state-store';
import { updatePlanStatus, completePlan as completePlanInDB, failPlan as failPlanInDB } from './proposed-plan-store';

// =============================================================================
// Pending Plan Store (populated by UI event, consumed by handler)
// =============================================================================

let pendingApprovedPlan: { workflowId: string; plan: Plan } | null = null;

// Listen for plan approval events from UI
emitter.on('vllora_plan_approved', ({ workflowId, plan }) => {
  console.log('[executePlan] Received plan approval event for dataset:', workflowId);
  pendingApprovedPlan = { workflowId, plan: plan as Plan };
});

/**
 * Get and consume the pending approved plan for a dataset.
 * First checks in-memory store, then falls back to IndexedDB persistence.
 */
export async function consumePendingPlan(workflowId: string): Promise<Plan | null> {
  console.log('[executePlan] Attempting to consume pending plan for:', workflowId);

  // Try in-memory store first
  if (pendingApprovedPlan?.workflowId === workflowId) {
    const plan = pendingApprovedPlan.plan;
    pendingApprovedPlan = null;
    console.log('[executePlan] Consumed pending plan from memory');
    return plan;
  }

  // Fall back to IndexedDB-persisted plan
  try {
    const { getStoredPlan } = await import('./proposed-plan-store');
    const storedPlan = await getStoredPlan(workflowId);
    if (storedPlan && (storedPlan.status === 'approved' || storedPlan.status === 'proposed' || storedPlan.status === 'executing' || storedPlan.status === 'failed')) {
      console.log('[executePlan] Consumed pending plan from IndexedDB (status:', storedPlan.status, ')');
      return storedPlan.plan;
    }
  } catch (error) {
    console.error('[executePlan] Failed to fetch persisted plan:', error);
  }

  console.log('[executePlan] No pending plan found');
  return null;
}

// =============================================================================
// Types
// =============================================================================

export type ExecutionStepId =
  | 'topics' | 'adjust_topics' | 'categorize' | 'generate' | 'grader' | 'dryrun' | 'finetune'
  // Iteration loop steps (inner loop — dataset improvement)
  | 'regenerate_topic'    // regenerate data for specific weak topics
  | 'adjust_grader'       // modify grader based on analysis
  | 'analyze'             // run post-eval analysis on dry run results
  // Outer loop steps (post-training)
  | 'post_training_eval'; // run eval on fine-tuned model vs base

export type ExecutionStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ExecutionStep {
  id: string;
  name: string;
  status: ExecutionStepStatus;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: string;
  /** Sub-item labels for detailed progress (e.g. "Applied 8 topics", "Generated 30/30 records") */
  details?: string[];
}

export interface ExecutionProgress {
  workflow_id: string;
  current_step: number;
  total_steps: number;
  steps: ExecutionStep[];
  is_complete: boolean;
  has_error: boolean;
}

/** Shared context passed to every step executor */
export interface StepContext {
  workflow_id: string;
  plan: Plan;
  /** Ordered subset of steps being executed for this run */
  selected_steps: ExecutionStepId[];
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };
  /** Mutable summary — each step updates its relevant fields */
  summary: ExecutionSummary;
}

export interface ExecutionSummary {
  topics_created: number;
  records_generated: number;
  grader_configured: boolean;
  dry_run_completed: boolean;
  dry_run_pass_rate?: number;
  ready_to_finetune: boolean;
  finetune_job_id?: string;
  finetune_job_status?: string;
}

/** Return type from a step executor */
interface StepResult {
  message: string;
  result?: unknown;
}

/** A registered step executor */
interface StepExecutor {
  name: string;
  /** Maps to workflow step for status tracking */
  workflowStep?: FinetuneStep;
  /** Workflow step status to set on completion (defaults to 'completed') */
  workflowStatus?: StepStatus;
  /** If true, failure does not abort the pipeline */
  nonFatal?: boolean;
  execute: (ctx: StepContext) => Promise<StepResult>;
}

interface ExecutePlanParams {
  workflow_id: string;
  plan: Plan;
  steps_to_execute?: ExecutionStepId[];
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };
}

interface ExecutePlanResult {
  success: boolean;
  error?: string;
  execution_id?: string;
  final_status?: ExecutionProgress;
  summary?: ExecutionSummary;
}

// =============================================================================
// Helpers
// =============================================================================

function emitProgress(progress: ExecutionProgress): void {
  emitter.emit('vllora_plan_progress' as any, { progress });
}

function generateTopicId(): string {
  return `topic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Build human-readable detail sub-items for a completed step.
 * These appear as indented sub-checkboxes in the plan markdown.
 */
function buildCompletedStepDetails(
  stepId: ExecutionStepId,
  result: StepResult,
  summary: ExecutionSummary,
  plan: Plan
): string[] {
  const details: string[] = [];
  const res = result.result as Record<string, unknown> | undefined;

  switch (stepId) {
    case 'topics': {
      const count = summary.topics_created || plan.total_topic_count || 0;
      details.push(`Applied ${count} topics`);
      break;
    }
    case 'adjust_topics': {
      const changes = (res as any)?.changes_made as string[] | undefined;
      if (changes?.length) {
        details.push(`Changes: ${changes.slice(0, 3).join(', ')}${changes.length > 3 ? '...' : ''}`);
      }
      const count = summary.topics_created;
      if (count > 0) details.push(`${count} topics total`);
      break;
    }
    case 'categorize': {
      const assigned = (res as any)?.categorization?.assigned_count;
      if (typeof assigned === 'number') details.push(`Categorized ${assigned} records`);
      break;
    }
    case 'generate': {
      const generated = summary.records_generated || (res as any)?.records_created || 0;
      const planned = plan.estimated_records || 0;
      if (planned > 0) {
        const pct = Math.round((generated / planned) * 100);
        details.push(`Generated ${generated}/${planned} records (${pct}%)`);
      } else {
        details.push(`Generated ${generated} records`);
      }
      break;
    }
    case 'grader': {
      const criteriaCount = plan.grader_config?.criteria?.length ?? 0;
      details.push(`Configured ${criteriaCount} criteria`);
      break;
    }
    case 'dryrun': {
      const jobId = (res as any)?.dry_run_job_id as string | undefined;
      if (jobId) details.push(`[${evalJobDisplayName(jobId)}](evaluations/jobs/${jobId})`);
      const passRate = summary.dry_run_pass_rate;
      if (typeof passRate === 'number') {
        details.push(`Pass rate: ${Math.round(passRate * 100)}%`);
      }
      break;
    }
    case 'finetune': {
      const ftId = summary.finetune_job_id;
      if (ftId) details.push(`[${finetuneJobDisplayName(ftId)}](finetune/${ftId})`);
      break;
    }
    case 'regenerate_topic': {
      const regenerated = (res as any)?.records_created || 0;
      const topics = (res as any)?.target_topics as string[] | undefined;
      if (topics?.length) details.push(`Topics: ${topics.join(', ')}`);
      if (regenerated > 0) details.push(`${regenerated} records generated`);
      break;
    }
    case 'adjust_grader': {
      details.push('Evaluator reconfigured');
      break;
    }
    case 'analyze': {
      details.push('Evaluation results analyzed');
      break;
    }
    case 'post_training_eval': {
      details.push('Post-training evaluation started');
      break;
    }
  }

  return details;
}

function convertToHierarchyNodes(
  proposedTopics: NonNullable<Plan['proposed_topics']>
): TopicHierarchyNode[] {
  return proposedTopics.map((topic) => ({
    id: generateTopicId(),
    name: topic.name,
    description: topic.description,
    sourceChunkRefs: topic.source_chunk_refs,
    children: topic.subtopics?.map((sub) => ({
      id: generateTopicId(),
      name: sub.name,
      description: sub.description,
      sourceChunkRefs: sub.source_chunk_refs,
      children: [],
    })) || [],
  }));
}

// =============================================================================
// Step Executors
// =============================================================================

async function executeTopics(ctx: StepContext): Promise<StepResult> {
  const { plan, workflow_id, summary } = ctx;
  const hierarchyNodes = convertToHierarchyNodes(plan.proposed_topics || []);

  // Auto-rollback if the workflow is in a state that doesn't allow topic changes (e.g. training).
  // The user approved a plan with the topics step, so rolling back is the right action.
  const allowedSteps = ['not_started', 'topics_config', 'grader_config'];
  const workflow = await workflowService.get(workflow_id);
  if (workflow && !allowedSteps.includes(workflow.currentStep)) {
    const rollback = await rollbackToStepHandler({ workflow_id, step: 'topics_config' });
    if (!(rollback as any).success) {
      throw new Error(
        `Cannot apply topics: workflow is in "${workflow.currentStep}" state and rollback to topics_config failed. ` +
        `${(rollback as any).error ?? ''}`
      );
    }
  }

  const result = await applyTopicHierarchyHandler({ workflow_id, hierarchy: hierarchyNodes });
  if (!(result as any).success) {
    throw new Error((result as any).error || 'Failed to apply topic hierarchy');
  }

  summary.topics_created = plan.total_topic_count || 0;

  // Warn if categorize is missing but the dataset already has records — they'll be unassigned.
  const stepsToRun = new Set(ctx.selected_steps);
  if (!stepsToRun.has('categorize')) {
    const existingRecordCount = await recordService.getCount(workflow_id);
    if (existingRecordCount > 0) {
      console.warn(
        '[executeTopics] New hierarchy applied but "categorize" is not in steps_to_execute. ' +
        'Existing records will not be assigned to the new topics.'
      );
      emitter.emit('vllora_lucy_prompt', {
        prompt: `Topics were applied but the plan does not include a "categorize" step. The dataset has existing records that are now unassigned to the new topics. Should I add a categorize step and re-run?`,
      });
    }
  }

  toast.success('Topics configured', {
    action: {
      label: 'View Records',
      onClick: () => emitter.emit('vllora_switch_tab', { workflowId: workflow_id, tab: 'records' }),
    },
  });

  return { message: `Applied ${summary.topics_created} topics`, result };
}

async function executeAdjustTopics(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, overrides, summary } = ctx;
  const instruction = overrides?.adjust_topics?.instruction ?? plan.adjust_topics_instruction;
  if (!instruction) throw new Error('adjust_topics requires an instruction (in plan.adjust_topics_instruction or overrides)');

  // Pre-flight: ensure a hierarchy exists to adjust
  const dataset = await datasetService.getById(workflow_id);
  if (!dataset?.topicHierarchy?.hierarchy?.length) {
    throw new Error(
      'No topic hierarchy exists to adjust. ' +
      'Recovery: add "topics" before "adjust_topics" in steps_to_execute and re-run execute_plan.'
    );
  }

  const result = await adjustTopicHierarchyHandler({ workflow_id, instruction });
  if (!(result as any).success) throw new Error((result as any).error || 'Failed to adjust topics');

  summary.topics_created = (result as any).topic_count ?? summary.topics_created;

  toast.success('Topics adjusted', {
    action: {
      label: 'View Records',
      onClick: () => emitter.emit('vllora_switch_tab', { workflowId: workflow_id, tab: 'records' }),
    },
  });

  return { message: `Adjusted topics: ${(result as any).changes_made?.join(', ') || 'Changes applied'}`, result };
}

async function executeCategorize(ctx: StepContext): Promise<StepResult> {
  const { workflow_id } = ctx;

  // Pre-flight: hierarchy must exist
  const dataset = await datasetService.getById(workflow_id);
  if (!dataset?.topicHierarchy?.hierarchy?.length) {
    throw new Error(
      'Cannot categorize: no topic hierarchy configured. ' +
      'Recovery: add "topics" before "categorize" in steps_to_execute and re-run execute_plan.'
    );
  }

  // Pre-flight: records must exist
  const recordCount = await recordService.getCount(workflow_id);
  if (recordCount === 0) {
    throw new Error(
      'Cannot categorize: dataset has no records. ' +
      'Recovery: add "generate" before "categorize" in steps_to_execute and re-run execute_plan.'
    );
  }

  const result = await categorizeRecordsHandler({ workflow_id });
  if (!(result as any).success) throw new Error((result as any).error || 'Failed to categorize records');

  return {
    message: `Categorized ${(result as any).categorization?.assigned_count ?? 0} records`,
    result,
  };
}

async function executeGenerate(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, overrides, summary } = ctx;

  // Pre-flight: dataset objective is required
  const dataset = await datasetService.getById(workflow_id);
  if (!dataset?.datasetObjective?.trim()) {
    emitter.emit('vllora_lucy_prompt', {
      prompt: 'The dataset has no training objective defined. What is the goal of this fine-tuning run? Please describe the task or behavior you want the model to learn.',
    });
    throw new Error(
      'Cannot generate data: dataset has no training objective defined. ' +
      'Recovery: ask the user for the training objective, set it via update_dataset, then re-run execute_plan.'
    );
  }

  const recordCount = overrides?.generate?.count ?? plan.estimated_records ?? 0;

  const result = await callGenerateInitialData({
    workflow_id,
    count: recordCount,
    use_knowledge: plan.data_generation?.grounded_in_knowledge ?? false,
    distribute_by_topic: true,
    output_format: plan.output_format || undefined,
    target_topics: overrides?.generate?.target_topics,
    per_topic_count: overrides?.generate?.per_topic_count,
  });

  if (!(result as any).success) {
    throw new Error((result as any).error || 'Failed to generate data');
  }

  summary.records_generated = (result as any).records_created || recordCount;
  return { message: `Generated ${summary.records_generated} training examples`, result };
}

async function executeGrader(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, summary } = ctx;

  if (!plan.grader_config?.criteria?.length) {
    throw new Error(
      'grader_config.criteria is required for grader step. ' +
      'Recovery: call suggest_grader({ workflow_id }) to get criteria, add them to the plan via adjust_plan, then re-run execute_plan.'
    );
  }

  // Generate template fresh from criteria at execution time.
  // This ensures the JS evaluator always reflects the latest criteria,
  // even if criteria changed between proposal and execution.
  const evalScript = generateGraderTemplate(
    plan.grader_config.criteria,
    plan.objective,
    plan.output_format,
  );

  await datasetService.updateEvalScript(workflow_id, evalScript);
  await workflowService.updateStepData(workflow_id, 'graderConfig', {
    type: 'js',
    configuredAt: Date.now(),
  });

  summary.grader_configured = true;

  toast.success('Evaluation configured', {
    action: {
      label: 'Review',
      onClick: () => emitter.emit('vllora_switch_tab', { workflowId: workflow_id, tab: 'evaluator' }),
    },
  });

  return { message: 'LLM-as-judge evaluator configured', result: { success: true, grader_type: 'llm-as-judge' } };
}

async function executeDryRun(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, summary } = ctx;

  const totalRecords = summary.records_generated || plan.estimated_records || 0;
  const targetSamples = Math.min(totalRecords, 10);
  const samplePercentage = totalRecords > 0
    ? Math.ceil((targetSamples / totalRecords) * 100)
    : 100;

  const result = await runEvaluationHandler({ workflow_id, sample_percentage: samplePercentage });

  if (!(result as any).success) {
    throw new Error((result as any).error || 'Failed to run evaluation');
  }

  summary.dry_run_completed = true;
  summary.dry_run_pass_rate = (result as any).stats?.pass_rate;
  summary.ready_to_finetune = true;

  return { message: 'Evaluation started in background', result };
}

async function executeRegenerateTopic(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, overrides, summary } = ctx;
  const targetTopics = overrides?.generate?.target_topics;

  if (!targetTopics?.length) {
    throw new Error(
      'regenerate_topic requires overrides.generate.target_topics to specify which topics to regenerate. ' +
      'Recovery: call execute_plan with overrides.generate.target_topics set to the weak topic names.'
    );
  }

  const perTopicCount = overrides?.generate?.per_topic_count ?? 15;

  const result = await callGenerateInitialData({
    workflow_id,
    count: perTopicCount * targetTopics.length,
    use_knowledge: plan.data_generation?.grounded_in_knowledge ?? false,
    distribute_by_topic: true,
    target_topics: targetTopics,
    per_topic_count: perTopicCount,
  });

  if (!(result as any).success) {
    throw new Error((result as any).error || 'Failed to regenerate topic data');
  }

  const regenerated = (result as any).records_created || 0;
  summary.records_generated += regenerated;

  toast.success(`Regenerated data for ${targetTopics.length} topic(s)`, {
    description: `${regenerated} new records`,
  });

  return { message: `Regenerated ${regenerated} records for topics: ${targetTopics.join(', ')}`, result };
}

async function executeAdjustGrader(ctx: StepContext): Promise<StepResult> {
  // Re-run grader configuration with updated criteria from the plan
  return executeGrader(ctx);
}

async function executeAnalyze(ctx: StepContext): Promise<StepResult> {
  const { workflow_id } = ctx;

  // Find the most recent completed dry run job for this dataset
  const { evalJobService: evalSvc } = await import('@/services/service-registry');
  const jobs = await evalSvc.getByDataset(workflow_id);
  const latestCompleted = [...jobs]
    .filter((j) => j.status === 'completed' && j.evaluationRunId)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];

  if (!latestCompleted?.evaluationRunId) {
    throw new Error(
      'No completed evaluation found for analysis. ' +
      'Recovery: run a dry run evaluation first, then re-run the analyze step.'
    );
  }

  const { analyzeEvaluationHandler } = await import('./analyze-evaluation');
  const result = await analyzeEvaluationHandler({
    workflow_id,
    evaluation_id: latestCompleted.evaluationRunId,
  });

  return { message: 'Evaluation analysis complete', result };
}

async function executePostTrainingEval(ctx: StepContext): Promise<StepResult> {
  // Same as dry run eval — runs the evaluation on the current dataset
  // (agent should set the model to the fine-tuned model in the plan)
  return executeDryRun(ctx);
}

async function executeFinetune(ctx: StepContext): Promise<StepResult> {
  const { workflow_id } = ctx;

  const datasetForJob = await datasetService.getById(workflow_id);
  if (!datasetForJob) {
    throw new Error('Dataset not found');
  }

  // quickFinetune disabled during plan execution
  // const result = await quickFinetune({
  //   workflowId: workflow_id,
  //   baseModel: 'Qwen3.5-4B',
  //   trainingConfig: {
  //     learning_rate: 0.00001,
  //     epochs: 2,
  //     batch_size_samples: 10,
  //     lora_rank: 8,
  //   },
  // });
  // if (!result.success) {
  //   throw new Error(result.error || 'Failed to create finetune job');
  // }

  // summary.finetune_job_id = result.jobId;
  // summary.finetune_job_status = result.status;

  // emitter.emit('vllora_finetune_job_created', {
  //   workflowId: workflow_id,
  //   jobId: result.jobId,
  // });

  // toast.success('Fine-tune job started', {
  //   action: {
  //     label: 'Check Job',
  //     onClick: () => emitter.emit('vllora_switch_tab', { workflowId: workflow_id, tab: 'jobs' }),
  //   },
  // });

  // // Mark workflow step as in_progress (not completed — training is async)
  // const wf = await workflowService.get(workflow_id);
  // if (wf) {
  //   wf.stepStatus.training = 'in_progress';
  //   wf.updatedAt = Date.now();
  //   await workflowService.update(wf);
  // }

  toast.info('Fine-tuning is currently disabled');
  return { message: 'Fine-tuning is currently disabled', result: null };
}

// =============================================================================
// Plan Validation
// =============================================================================

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}

/** Canonical ordered list of all step IDs — defines execution order */
export const STEP_ORDER: ExecutionStepId[] = [
  'topics', 'adjust_topics', 'categorize', 'generate',
  'grader', 'dryrun', 'finetune',
  // Iteration loop steps (can appear in iteration plans)
  'regenerate_topic', 'adjust_grader', 'analyze', 'post_training_eval',
];
const STEP_ORDER_SET = new Set<string>(STEP_ORDER);
const LEGACY_STEP_IDS = new Set<string>(['readme']);

interface NormalizedStepSelection {
  steps: ExecutionStepId[];
  unknownSteps: string[];
  filteredLegacySteps: string[];
}

function normalizeRequestedSteps(stepIds?: readonly string[] | null): NormalizedStepSelection {
  if (stepIds == null) {
    return { steps: [...STEP_ORDER], unknownSteps: [], filteredLegacySteps: [] };
  }

  const steps: ExecutionStepId[] = [];
  const unknownSteps: string[] = [];
  const filteredLegacySteps: string[] = [];

  for (const stepId of stepIds) {
    if (LEGACY_STEP_IDS.has(stepId)) {
      filteredLegacySteps.push(stepId);
      continue;
    }

    if (STEP_ORDER_SET.has(stepId)) {
      const typedId = stepId as ExecutionStepId;
      if (!steps.includes(typedId)) {
        steps.push(typedId);
      }
      continue;
    }

    unknownSteps.push(stepId);
  }

  return { steps, unknownSteps, filteredLegacySteps };
}

/**
 * Validate a plan before execution. Checks that all step IDs are known
 * and that each step's prerequisites are satisfied in the plan data.
 *
 * Called in two places:
 * 1. UI gate (PlanContext.approvePlan) — shows toast.error and blocks approval
 * 2. Handler gate (executePlanHandler) — safety net before marking 'executing'
 */
export function validatePlanForExecution(
  plan: Plan,
  stepsToRun: Set<ExecutionStepId>,
  overrides?: StepContext['overrides'],
): PlanValidationResult {
  const errors: string[] = [];

  // Validate step IDs and prerequisites
  for (const id of stepsToRun) {
    if (!STEP_ORDER.includes(id)) {
      errors.push(`Unknown step: '${id}'`);
    }
  }

  // Per-step prerequisite checks
  if (stepsToRun.has('topics') && (!plan.proposed_topics || plan.proposed_topics.length === 0)) {
    errors.push("Step 'topics' requires proposed_topics in the plan");
  }

  if (stepsToRun.has('adjust_topics')) {
    const instruction = overrides?.adjust_topics?.instruction ?? plan.adjust_topics_instruction;
    if (!instruction?.trim()) {
      errors.push("Step 'adjust_topics' requires an instruction (in plan or overrides)");
    }
  }

  if (stepsToRun.has('generate')) {
    const hasCount = (overrides?.generate?.count ?? plan.estimated_records ?? 0) > 0;
    const hasPerTopic = (overrides?.generate?.per_topic_count ?? 0) > 0;
    if (!hasCount && !hasPerTopic) {
      errors.push("Step 'generate' requires a record count (estimated_records, overrides.generate.count, or per_topic_count)");
    }
  }

  if (stepsToRun.has('grader') && !plan.grader_config?.criteria?.length) {
    errors.push("Step 'grader' requires grader_config.criteria in the plan");
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Step Registry
// =============================================================================

const STEP_REGISTRY: Record<ExecutionStepId, StepExecutor> = {
  topics:        { name: 'Apply Topic Hierarchy',  workflowStep: 'topics_config',       execute: executeTopics },
  adjust_topics: { name: 'Adjust Topics',          workflowStep: 'topics_config',       execute: executeAdjustTopics },
  categorize:    { name: 'Categorize Records',     workflowStep: 'categorize',          execute: executeCategorize },
  generate:      { name: 'Generate Data',          workflowStep: 'coverage_generation', execute: executeGenerate },
  grader:        { name: 'Configure Evaluator',    workflowStep: 'grader_config',       execute: executeGrader },
  dryrun:             { name: 'Run Evaluation',          workflowStep: 'dry_run',             execute: executeDryRun,            nonFatal: true },
  finetune:           { name: 'Start Finetune Job',                                           execute: executeFinetune,           nonFatal: true },
  // Iteration loop steps (inner loop)
  regenerate_topic:   { name: 'Regenerate Topic Data',   workflowStep: 'coverage_generation', execute: executeRegenerateTopic },
  adjust_grader:      { name: 'Adjust Evaluator',        workflowStep: 'grader_config',       execute: executeAdjustGrader },
  analyze:            { name: 'Analyze Evaluation',                                           execute: executeAnalyze,            nonFatal: true },
  // Outer loop steps
  post_training_eval: { name: 'Post-Training Evaluation', workflowStep: 'dry_run',            execute: executePostTrainingEval,   nonFatal: true },
};

// =============================================================================
// Dynamic Execution (for generic plans)
// =============================================================================

/**
 * Execute a generic plan's dynamic_steps by dispatching tools by name.
 * Emits the same vllora_plan_progress events as finetune execution.
 */
async function executeDynamicSteps(
  workflowId: string,
  plan: Plan,
  progress: ExecutionProgress,
): Promise<{ success: boolean; error?: string }> {
  const dynamicSteps = plan.dynamic_steps ?? [];

  const updateStep = (stepId: string, updates: Partial<ExecutionStep>): void => {
    const step = progress.steps.find((s) => s.id === stepId);
    if (step) {
      Object.assign(step, updates);
      emitProgress(progress);
    }
  };

  // Build a set of completed step IDs for dependency resolution
  const completedStepIds = new Set<string>();

  for (let i = 0; i < dynamicSteps.length; i++) {
    const ds = dynamicSteps[i];

    // Check cancellation
    if (isExecutionCancelled(workflowId)) {
      clearCancellation(workflowId);
      for (const s of progress.steps) {
        if (s.status === 'pending') s.status = 'skipped';
      }
      progress.is_complete = true;
      progress.has_error = true;
      emitProgress(progress);
      return { success: false, error: 'Execution cancelled by user' };
    }

    // Check dependencies
    if (ds.depends_on?.length) {
      const unmet = ds.depends_on.filter(dep => !completedStepIds.has(dep));
      if (unmet.length > 0) {
        updateStep(ds.id, {
          status: 'failed',
          error: `Unmet dependencies: ${unmet.join(', ')}`,
          details: [`Blocked by: ${unmet.join(', ')}`],
        });
        progress.has_error = true;
        continue; // Skip this step but continue with others
      }
    }

    progress.current_step = i;
    updateStep(ds.id, { status: 'running', message: `${ds.label}...` });

    try {
      // Lazy import to break circular dependency (see comment at top of file)
      const { executeFinetuneTool } = await import('../index');
      // Dispatch the tool by name with its params
      const result = await executeFinetuneTool(ds.tool_name, {
        ...ds.tool_params,
        workflow_id: workflowId,
      });

      const resultObj = result as Record<string, unknown>;
      if (resultObj && resultObj.success === false) {
        throw new Error((resultObj.error as string) || `${ds.tool_name} failed`);
      }

      // Extract detail strings from result if available
      const details: string[] = [];
      if (resultObj?.message) details.push(resultObj.message as string);

      updateStep(ds.id, {
        status: 'completed',
        message: `${ds.label} completed`,
        result,
        details: details.length > 0 ? details : undefined,
      });
      completedStepIds.add(ds.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStep(ds.id, {
        status: 'failed',
        error: errorMessage,
        details: [errorMessage],
      });
      progress.has_error = true;
      // For generic plans, a failed step aborts the pipeline
      return { success: false, error: `Step "${ds.label}" failed: ${errorMessage}` };
    }
  }

  return { success: true };
}

// =============================================================================
// Main Handler (registry-based loop)
// =============================================================================

export const executePlanHandler: ToolHandler = async (
  params
): Promise<ExecutePlanResult> => {
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Declared outside try so the catch block can access them for error reporting
  let progress: ExecutionProgress | null = null;
  let summary: ExecutionSummary | null = null;

  try {
    console.log('[executePlan] Starting execution:', executionId);

    const {
      workflow_id,
      plan: planFromParams,
      steps_to_execute,
      overrides,
    } = params as unknown as ExecutePlanParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    // Resolve plan: params → in-memory → IndexedDB
    const resolvedPlan = planFromParams || await consumePendingPlan(workflow_id);
    if (!resolvedPlan) {
      return { success: false, error: 'No plan provided. Please approve a plan first.' };
    }

    const planSelection = normalizeRequestedSteps(
      Array.isArray(resolvedPlan.steps_to_execute)
        ? (resolvedPlan.steps_to_execute as unknown as string[])
        : undefined
    );
    if (planSelection.unknownSteps.length > 0) {
      return {
        success: false,
        error: `Plan has unknown step IDs: ${planSelection.unknownSteps.join(', ')}`,
      };
    }
    if (planSelection.filteredLegacySteps.length > 0) {
      console.log(
        `[executePlan] Ignoring legacy plan step IDs: ${planSelection.filteredLegacySteps.join(', ')}`
      );
    }

    const plan: Plan = {
      ...resolvedPlan,
      steps_to_execute: planSelection.steps,
    };

    // Verify dataset
    const dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found` };
    }

    // =========================================================================
    // Generic plan execution path (dynamic steps)
    // =========================================================================
    if (plan.plan_type === 'generic') {
      const dynamicSteps = plan.dynamic_steps ?? [];
      if (dynamicSteps.length === 0) {
        return { success: false, error: 'Generic plan has no dynamic_steps to execute.' };
      }

      updatePlanStatus(workflow_id, 'executing');

      // Build progress from dynamic_steps
      progress = {
        workflow_id,
        current_step: 0,
        total_steps: dynamicSteps.length,
        steps: dynamicSteps.map((ds) => ({
          id: ds.id,
          name: ds.label,
          status: 'pending' as const,
        })),
        is_complete: false,
        has_error: false,
      };

      summary = {
        topics_created: 0,
        records_generated: 0,
        grader_configured: false,
        dry_run_completed: false,
        ready_to_finetune: false,
      };

      emitProgress(progress);

      const dynamicResult = await executeDynamicSteps(workflow_id, plan, progress);

      progress.is_complete = true;
      progress.has_error = !dynamicResult.success;
      emitProgress(progress);

      if (dynamicResult.success) {
        await completePlanInDB(workflow_id, progress, summary);
        emitter.emit('vllora_workflow_updated', { workflowId: workflow_id });
      } else {
        await failPlanInDB(workflow_id, progress, summary);
      }

      return {
        success: dynamicResult.success,
        error: dynamicResult.error,
        execution_id: executionId,
        final_status: progress,
        summary,
      };
    }

    // =========================================================================
    // Finetune plan execution path (step registry)
    // =========================================================================

    // Get or create workflow
    let workflow = await workflowService.getByDataset(workflow_id);
    if (!workflow) {
      workflow = await workflowService.create(workflow_id, dataset.datasetObjective || 'Plan execution');
    }

    // Determine which steps to run (params > normalized plan > all)
    if (steps_to_execute !== undefined && !Array.isArray(steps_to_execute)) {
      return { success: false, error: 'steps_to_execute must be an array when provided' };
    }

    const stepSelection = normalizeRequestedSteps(
      Array.isArray(steps_to_execute)
        ? (steps_to_execute as unknown as string[])
        : (plan.steps_to_execute as unknown as string[] | undefined)
    );
    if (stepSelection.unknownSteps.length > 0) {
      return {
        success: false,
        error: `Unknown step IDs in steps_to_execute: ${stepSelection.unknownSteps.join(', ')}`,
      };
    }
    if (stepSelection.filteredLegacySteps.length > 0) {
      console.log(
        `[executePlan] Ignoring legacy steps_to_execute entries: ${stepSelection.filteredLegacySteps.join(', ')}`
      );
    }
    const stepsToRun = new Set<ExecutionStepId>(stepSelection.steps);

    // Merge overrides (params > plan)
    const effectiveOverrides = overrides || plan.overrides;

    // Validate plan before execution
    const validation = validatePlanForExecution(plan, stepsToRun, effectiveOverrides);
    if (!validation.valid) {
      return { success: false, error: `Plan validation failed: ${validation.errors.join('; ')}` };
    }

    // Mark plan as executing (only after validation passes)
    updatePlanStatus(workflow_id, 'executing');

    console.log('[executePlan] Steps:', [...stepsToRun]);

    // Build step context
    summary = {
      topics_created: 0,
      records_generated: 0,
      grader_configured: false,
      dry_run_completed: false,
      ready_to_finetune: false,
    };

    const ctx: StepContext = {
      workflow_id: workflow.id,
      plan,
      selected_steps: stepSelection.steps,
      overrides: effectiveOverrides,
      summary,
    };

    // Initialize progress tracking from registry
    const steps: ExecutionStep[] = STEP_ORDER.map((id) => ({
      id,
      name: STEP_REGISTRY[id].name,
      status: stepsToRun.has(id) ? 'pending' as const : 'skipped' as const,
      ...(!stepsToRun.has(id) ? { message: 'Skipped' } : {}),
    }));

    progress = {
      workflow_id,
      current_step: 0,
      total_steps: steps.length,
      steps,
      is_complete: false,
      has_error: false,
    };

    const updateStep = (stepId: string, updates: Partial<ExecutionStep>): void => {
      if (!progress) return;
      const step = progress.steps.find((s) => s.id === stepId);
      if (step) {
        Object.assign(step, updates);
        emitProgress(progress);
      }
    };

    const markWorkflowStep = async (
      finetuneStep: FinetuneStep,
      status: StepStatus,
    ): Promise<void> => {
      try {
        const wf = await workflowService.get(workflow.id);
        if (wf) {
          wf.stepStatus[finetuneStep] = status;
          wf.updatedAt = Date.now();
          await workflowService.update(wf);
        }
      } catch (err) {
        console.warn('[executePlan] Failed to update workflow step:', finetuneStep, err);
      }
    };

    // Emit initial progress
    emitProgress(progress);

    // =========================================================================
    // Execute steps from registry
    // =========================================================================
    for (const stepId of STEP_ORDER) {
      if (!stepsToRun.has(stepId)) continue;

      // Check cancellation before starting each step
      if (isExecutionCancelled(workflow_id)) {
        clearCancellation(workflow_id);
        // Mark remaining steps as skipped
        for (const s of progress.steps) {
          if (s.status === 'pending') s.status = 'skipped';
        }
        progress.is_complete = true;
        progress.has_error = true;
        emitProgress(progress);
        await failPlanInDB(workflow_id, progress, summary);
        throw new Error('Execution cancelled by user');
      }

      const executor = STEP_REGISTRY[stepId];
      progress.current_step = STEP_ORDER.indexOf(stepId);
      updateStep(stepId, { status: 'running', message: `${executor.name}...` });

      try {
        const result = await executor.execute(ctx);

        // Build detailed sub-items for this step's completion
        const details = buildCompletedStepDetails(stepId, result, summary, ctx.plan);

        updateStep(stepId, {
          status: 'completed',
          message: result.message,
          result: result.result,
          details: details.length > 0 ? details : undefined,
        });

        if (executor.workflowStep) {
          await markWorkflowStep(executor.workflowStep, executor.workflowStatus || 'completed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateStep(stepId, { status: 'failed', error: errorMessage, details: [errorMessage] });

        if (executor.nonFatal) {
          // Non-fatal: log and continue
          console.error(`[executePlan] ${executor.name} failed (non-fatal):`, error);
          // For dryrun failure, still mark as ready if we have records + grader
          if (stepId === 'dryrun') {
            summary.ready_to_finetune = summary.records_generated > 0 && summary.grader_configured;
          }
        } else {
          // Fatal: abort pipeline
          progress.has_error = true;
          throw error;
        }
      }
    }

    // =========================================================================
    // Complete
    // =========================================================================
    progress.is_complete = true;
    emitProgress(progress);

    // Directly persist completion to IndexedDB (belt-and-suspenders with event listeners)
    await completePlanInDB(workflow_id, progress, summary);

    emitter.emit('vllora_workflow_updated', { workflowId: workflow_id });

    console.log('[executePlan] Execution complete:', executionId);

    return {
      success: true,
      execution_id: executionId,
      final_status: progress,
      summary,
    };
  } catch (error) {
    console.error('[executePlan] Failed:', error);
    const { workflow_id } = params as unknown as ExecutePlanParams;

    // Mark progress as complete+error (use real progress if available)
    if (progress) {
      progress.is_complete = true;
      progress.has_error = true;
      emitProgress(progress);
    }

    if (workflow_id) {
      failPlanInDB(workflow_id, progress ?? {
        workflow_id,
        current_step: 0,
        total_steps: 0,
        steps: [],
        is_complete: true,
        has_error: true,
      }, summary);
    }

    // Build an actionable error with completed/failed step info so the agent
    // knows to RESUME (not recreate) the plan.
    const completedSteps = progress?.steps.filter(s => s.status === 'completed').map(s => s.id) ?? [];
    const failedStep = progress?.steps.find(s => s.status === 'failed');
    const remainingSteps = progress?.steps
      .filter(s => s.status === 'pending' || s.status === 'failed')
      .map(s => s.id) ?? [];

    const errorMsg = error instanceof Error ? error.message : 'Plan execution failed';
    const resumeHint = completedSteps.length > 0
      ? ` Completed steps: [${completedSteps.join(', ')}].` +
        (failedStep ? ` Failed at: ${failedStep.id} (${failedStep.error}).` : '') +
        ` To resume, call execute_plan with steps_to_execute: [${remainingSteps.join(', ')}].` +
        ` Do NOT create a new plan — the existing plan is still valid.`
      : '';

    return {
      success: false,
      error: errorMsg + resumeHint,
      execution_id: executionId,
      final_status: progress ?? undefined,
      summary: summary ?? undefined,
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const executePlanTool: DistriFnTool = {
  name: 'execute_plan',
  description: `DEPRECATED: Prefer calling tools directly (apply_topic_hierarchy, generate_initial_data, etc.) + update_plan_markdown after each step.

This tool still works for backward compatibility. It runs steps from the plan's steps_to_execute in order.

Available steps: ${STEP_ORDER.join(', ')}`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to execute the plan for',
      },
      plan: {
        type: 'object',
        description: 'Optional: The plan. If not provided, retrieves from UI approval.',
      },
      steps_to_execute: {
        type: 'array',
        items: { type: 'string', enum: [...STEP_ORDER] },
        description: 'Optional: Override which steps to run. If omitted, uses plan.steps_to_execute or all steps.',
      },
      overrides: {
        type: 'object',
        description: 'Optional: Per-step parameter overrides.',
        properties: {
          adjust_topics: {
            type: 'object',
            properties: {
              instruction: { type: 'string', description: 'Natural language instruction for topic adjustment' },
            },
          },
          generate: {
            type: 'object',
            properties: {
              count: { type: 'number', description: 'Number of records to generate' },
              target_topics: { type: 'array', items: { type: 'string' }, description: 'Generate only for these specific topic names' },
              per_topic_count: { type: 'number', description: 'Override count per each target topic' },
            },
          },
          upload: {
            type: 'object',
            properties: {
              force_reupload: { type: 'boolean', description: 'Force re-upload' },
            },
          },
        },
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await executePlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
