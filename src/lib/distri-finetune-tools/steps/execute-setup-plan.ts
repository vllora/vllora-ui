/**
 * Execute Setup Plan Tool
 *
 * Registry-based orchestrator. Each step is a registered executor.
 * The handler iterates plan.steps_to_execute and calls each executor.
 *
 * To add a new step: define an executor function, add it to STEP_REGISTRY.
 */

import type { DistriFnTool } from '@distri/core';
import { toast } from 'sonner';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import * as workflowDB from '@/services/finetune-workflow-db';
import type { ToolHandler } from '../types';
import type { SetupPlan } from './propose-setup-plan';
import type { TopicHierarchyNode } from '@/types/dataset-types';

// Import step handlers
import { applyTopicHierarchyHandler } from './apply-hierarchy';
import { adjustTopicHierarchyHandler } from './adjust-hierarchy';
import { categorizeRecordsHandler } from './categorize-records';
import { generateInitialDataHandler } from './generate-initial-data';
import { uploadDatasetHandler } from './upload-dataset';
import { runDryRunHandler } from './run-dry-run';

// Import for README generation
import * as knowledgeDB from '@/services/knowledge-sources-db';
import { generateDatasetReadme, type KnowledgeSourceInfo, type SetupPlanSummary } from '@/services/dataset-readme-generator';

// Import for finetune job creation
import { quickFinetune } from '@/services/quick-finetune';

// Side-effect import to ensure execution state store is listening for progress events
import './execution-state-store';
import { updatePlanStatus, completePlan as completePlanInDB, failPlan as failPlanInDB } from './proposed-plan-store';

// =============================================================================
// Pending Plan Store (populated by UI event, consumed by handler)
// =============================================================================

let pendingApprovedPlan: { datasetId: string; plan: SetupPlan } | null = null;

// Listen for plan approval events from UI
emitter.on('vllora_setup_plan_approved', ({ datasetId, plan }) => {
  console.log('[executeSetupPlan] Received plan approval event for dataset:', datasetId);
  pendingApprovedPlan = { datasetId, plan: plan as SetupPlan };
});

/**
 * Get and consume the pending approved plan for a dataset.
 * First checks in-memory store, then falls back to IndexedDB persistence.
 */
export async function consumePendingPlan(datasetId: string): Promise<SetupPlan | null> {
  console.log('[executeSetupPlan] Attempting to consume pending plan for:', datasetId);

  // Try in-memory store first
  if (pendingApprovedPlan?.datasetId === datasetId) {
    const plan = pendingApprovedPlan.plan;
    pendingApprovedPlan = null;
    console.log('[executeSetupPlan] Consumed pending plan from memory');
    return plan;
  }

  // Fall back to IndexedDB-persisted plan
  try {
    const { getStoredPlan } = await import('./proposed-plan-store');
    const storedPlan = await getStoredPlan(datasetId);
    if (storedPlan && (storedPlan.status === 'approved' || storedPlan.status === 'proposed' || storedPlan.status === 'executing' || storedPlan.status === 'failed')) {
      console.log('[executeSetupPlan] Consumed pending plan from IndexedDB (status:', storedPlan.status, ')');
      return storedPlan.plan;
    }
  } catch (error) {
    console.error('[executeSetupPlan] Failed to fetch persisted plan:', error);
  }

  console.log('[executeSetupPlan] No pending plan found');
  return null;
}

// =============================================================================
// Types
// =============================================================================

export type ExecutionStepId = 'topics' | 'adjust_topics' | 'categorize' | 'generate' | 'grader' | 'upload' | 'dryrun' | 'readme' | 'finetune';

export type ExecutionStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ExecutionStep {
  id: string;
  name: string;
  status: ExecutionStepStatus;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: string;
}

export interface ExecutionProgress {
  dataset_id: string;
  current_step: number;
  total_steps: number;
  steps: ExecutionStep[];
  is_complete: boolean;
  has_error: boolean;
}

/** Shared context passed to every step executor */
export interface StepContext {
  dataset_id: string;
  plan: SetupPlan;
  workflow_id: string;
  workflow: workflowDB.FinetuneWorkflowState;
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
  workflowStep?: workflowDB.FinetuneStep;
  /** Workflow step status to set on completion (defaults to 'completed') */
  workflowStatus?: workflowDB.StepStatus;
  /** If true, failure does not abort the pipeline */
  nonFatal?: boolean;
  execute: (ctx: StepContext) => Promise<StepResult>;
}

interface ExecuteSetupPlanParams {
  dataset_id: string;
  plan: SetupPlan;
  steps_to_execute?: ExecutionStepId[];
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };
}

interface ExecuteSetupPlanResult {
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
  emitter.emit('vllora_setup_plan_progress' as any, { progress });
}

function generateTopicId(): string {
  return `topic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function convertToHierarchyNodes(
  proposedTopics: NonNullable<SetupPlan['proposed_topics']>
): TopicHierarchyNode[] {
  return proposedTopics.map((topic) => ({
    id: generateTopicId(),
    name: topic.name,
    description: topic.description,
    children: topic.subtopics?.map((sub) => ({
      id: generateTopicId(),
      name: sub.name,
      description: sub.description,
      children: [],
    })) || [],
  }));
}

// =============================================================================
// Step Executors
// =============================================================================

async function executeTopics(ctx: StepContext): Promise<StepResult> {
  const { plan, workflow_id, summary, dataset_id } = ctx;
  const hierarchyNodes = convertToHierarchyNodes(plan.proposed_topics || []);

  const result = await applyTopicHierarchyHandler({ workflow_id, hierarchy: hierarchyNodes });
  if (!(result as any).success) {
    throw new Error((result as any).error || 'Failed to apply topic hierarchy');
  }

  summary.topics_created = plan.total_topic_count || 0;

  toast.success('Topics configured', {
    action: {
      label: 'View Data',
      onClick: () => emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'records' }),
    },
  });

  return { message: `Applied ${summary.topics_created} topics`, result };
}

async function executeAdjustTopics(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, overrides, summary, dataset_id } = ctx;
  const instruction = overrides?.adjust_topics?.instruction ?? plan.adjust_topics_instruction;
  if (!instruction) throw new Error('adjust_topics requires an instruction (in plan.adjust_topics_instruction or overrides)');

  const result = await adjustTopicHierarchyHandler({ workflow_id, instruction });
  if (!(result as any).success) throw new Error((result as any).error || 'Failed to adjust topics');

  summary.topics_created = (result as any).topic_count ?? summary.topics_created;

  toast.success('Topics adjusted', {
    action: {
      label: 'View Data',
      onClick: () => emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'records' }),
    },
  });

  return { message: `Adjusted topics: ${(result as any).changes_made?.join(', ') || 'Changes applied'}`, result };
}

async function executeCategorize(ctx: StepContext): Promise<StepResult> {
  const { workflow_id } = ctx;

  const result = await categorizeRecordsHandler({ workflow_id });
  if (!(result as any).success) throw new Error((result as any).error || 'Failed to categorize records');

  return {
    message: `Categorized ${(result as any).categorization?.assigned_count ?? 0} records`,
    result,
  };
}

async function executeGenerate(ctx: StepContext): Promise<StepResult> {
  const { dataset_id, plan, overrides, summary } = ctx;
  const recordCount = overrides?.generate?.count ?? plan.estimated_records ?? 0;

  const result = await generateInitialDataHandler({
    dataset_id,
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
  const { dataset_id, plan, workflow_id, summary } = ctx;

  const evalScript = plan.grader_config?.template_preview;
  if (!evalScript) {
    throw new Error('Grader config template_preview is required for grader step');
  }

  await datasetsDB.updateDatasetEvalScript(dataset_id, evalScript);
  await workflowDB.updateStepData(workflow_id, 'graderConfig', {
    type: 'js',
    configuredAt: Date.now(),
  });

  summary.grader_configured = true;

  toast.success('Evaluation configured', {
    action: {
      label: 'Review',
      onClick: () => emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'evaluator' }),
    },
  });

  return { message: 'LLM-as-judge evaluator configured', result: { success: true, grader_type: 'llm-as-judge' } };
}

async function executeUpload(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, overrides } = ctx;

  const result = await uploadDatasetHandler({
    workflow_id,
    force_reupload: overrides?.upload?.force_reupload ?? true,
  });

  if (!(result as any).success && !(result as any).already_uploaded) {
    throw new Error((result as any).error || 'Failed to upload dataset');
  }

  return { message: 'Dataset uploaded', result };
}

async function executeDryRun(ctx: StepContext): Promise<StepResult> {
  const { workflow_id, plan, summary } = ctx;

  const totalRecords = summary.records_generated || plan.estimated_records || 0;
  const targetSamples = Math.min(totalRecords, 10);
  const samplePercentage = totalRecords > 0
    ? Math.ceil((targetSamples / totalRecords) * 100)
    : 100;

  const result = await runDryRunHandler({ workflow_id, sample_percentage: samplePercentage });

  if (!(result as any).success) {
    throw new Error((result as any).error || 'Failed to run dry run');
  }

  summary.dry_run_completed = true;
  summary.dry_run_pass_rate = (result as any).stats?.pass_rate;
  summary.ready_to_finetune = true;

  return { message: 'Dry run started in background', result };
}

async function executeReadme(ctx: StepContext): Promise<StepResult> {
  const { dataset_id, plan, workflow, summary } = ctx;

  const updatedDataset = await datasetsDB.getDatasetById(dataset_id);
  const allRecords = await datasetsDB.getRecordsByDatasetId(dataset_id);

  const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
  const knowledgeSources: KnowledgeSourceInfo[] = sources
    .filter(s => s.status === 'ready')
    .map(s => ({
      name: s.name,
      type: s.type,
      section_headings: s.extractedContent?.sectionHeadings || [],
      size: s.size,
    }));

  const setupPlanSummary: SetupPlanSummary = {
    executed_at: Date.now(),
    topics_created: summary.topics_created,
    records_generated: summary.records_generated,
    grader_configured: summary.grader_configured,
    dry_run_completed: summary.dry_run_completed,
    system_prompt_template: plan.output_format?.system_prompt_template || undefined,
    output_schema: plan.output_format?.schema || undefined,
    strategy: plan.data_generation?.strategy || undefined,
    grader_criteria: plan.grader_config?.criteria || undefined,
  };

  const readme = generateDatasetReadme({
    dataset: updatedDataset!,
    records: allRecords,
    workflow,
    knowledgeSources,
    setupPlanSummary,
  });

  await datasetsDB.updateDatasetReadme(dataset_id, readme);

  return { message: 'README generated with data provenance and statistics' };
}

async function executeFinetune(ctx: StepContext): Promise<StepResult> {
  const { dataset_id, summary, workflow_id } = ctx;

  const datasetForJob = await datasetsDB.getDatasetById(dataset_id);
  if (!datasetForJob?.backendDatasetId) {
    throw new Error('Dataset not uploaded to backend');
  }

  const result = await quickFinetune({ datasetId: dataset_id, baseModel: 'google/gemma-3-4b-it' });
  if (!result.success) {
    throw new Error(result.error || 'Failed to create finetune job');
  }

  summary.finetune_job_id = result.jobId;
  summary.finetune_job_status = result.status;

  emitter.emit('vllora_finetune_job_created', {
    backendDatasetId: datasetForJob.backendDatasetId,
    jobId: result.jobId,
  });

  toast.success('Fine-tune job started', {
    action: {
      label: 'Check Job',
      onClick: () => emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'jobs' }),
    },
  });

  // Mark workflow step as in_progress (not completed — training is async)
  const wf = await workflowDB.getWorkflow(workflow_id);
  if (wf) {
    wf.stepStatus.training = 'in_progress';
    wf.updatedAt = Date.now();
    await workflowDB.updateWorkflow(wf);
  }

  return { message: `Finetune job started: ${result.jobId}`, result };
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
  'grader', 'upload', 'dryrun', 'readme', 'finetune',
];

/**
 * Validate a plan before execution. Checks that all step IDs are known
 * and that each step's prerequisites are satisfied in the plan data.
 *
 * Called in two places:
 * 1. UI gate (SetupPlanContext.approvePlan) — shows toast.error and blocks approval
 * 2. Handler gate (executeSetupPlanHandler) — safety net before marking 'executing'
 */
export function validatePlanForExecution(
  plan: SetupPlan,
  stepsToRun: Set<ExecutionStepId>,
  overrides?: StepContext['overrides'],
): PlanValidationResult {
  const errors: string[] = [];

  // Validate all step IDs are known
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

  if (stepsToRun.has('grader') && !plan.grader_config?.template_preview?.trim()) {
    errors.push("Step 'grader' requires grader_config.template_preview in the plan");
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
  upload:        { name: 'Upload Dataset',                                               execute: executeUpload },
  dryrun:        { name: 'Run Dry Run',            workflowStep: 'dry_run',             execute: executeDryRun,   nonFatal: true },
  readme:        { name: 'Generate README',                                              execute: executeReadme,   nonFatal: true },
  finetune:      { name: 'Start Finetune Job',                                           execute: executeFinetune, nonFatal: true },
};

// =============================================================================
// Main Handler (registry-based loop)
// =============================================================================

export const executeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ExecuteSetupPlanResult> => {
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Declared outside try so the catch block can access them for error reporting
  let progress: ExecutionProgress | null = null;
  let summary: ExecutionSummary | null = null;

  try {
    console.log('[executeSetupPlan] Starting execution:', executionId);

    const {
      dataset_id,
      plan: planFromParams,
      steps_to_execute,
      overrides,
    } = params as unknown as ExecuteSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Resolve plan: params → in-memory → IndexedDB
    const plan = planFromParams || await consumePendingPlan(dataset_id);
    if (!plan) {
      return { success: false, error: 'No flow provided. Please approve a flow first.' };
    }

    // Verify dataset
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Get or create workflow
    let workflow = await workflowDB.getWorkflowByDataset(dataset_id);
    if (!workflow) {
      workflow = await workflowDB.createWorkflow(dataset_id, dataset.datasetObjective || 'Plan execution');
    }

    // Determine which steps to run (params > plan > all)
    const stepsToRun = new Set<ExecutionStepId>(
      steps_to_execute || plan.steps_to_execute || STEP_ORDER
    );

    // Merge overrides (params > plan)
    const effectiveOverrides = overrides || plan.overrides;

    // Validate plan before execution
    const validation = validatePlanForExecution(plan, stepsToRun, effectiveOverrides);
    if (!validation.valid) {
      return { success: false, error: `Plan validation failed: ${validation.errors.join('; ')}` };
    }

    // Mark plan as executing (only after validation passes)
    updatePlanStatus(dataset_id, 'executing');

    console.log('[executeSetupPlan] Steps:', [...stepsToRun]);

    // Build step context
    summary = {
      topics_created: 0,
      records_generated: 0,
      grader_configured: false,
      dry_run_completed: false,
      ready_to_finetune: false,
    };

    const ctx: StepContext = {
      dataset_id,
      plan,
      workflow_id: workflow.id,
      workflow,
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
      dataset_id,
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
      finetuneStep: workflowDB.FinetuneStep,
      status: workflowDB.StepStatus,
    ): Promise<void> => {
      try {
        const wf = await workflowDB.getWorkflow(workflow.id);
        if (wf) {
          wf.stepStatus[finetuneStep] = status;
          wf.updatedAt = Date.now();
          await workflowDB.updateWorkflow(wf);
        }
      } catch (err) {
        console.warn('[executeSetupPlan] Failed to update workflow step:', finetuneStep, err);
      }
    };

    // Emit initial progress
    emitProgress(progress);

    // =========================================================================
    // Execute steps from registry
    // =========================================================================
    for (const stepId of STEP_ORDER) {
      if (!stepsToRun.has(stepId)) continue;

      const executor = STEP_REGISTRY[stepId];
      progress.current_step = STEP_ORDER.indexOf(stepId);
      updateStep(stepId, { status: 'running', message: `${executor.name}...` });

      try {
        const result = await executor.execute(ctx);

        updateStep(stepId, {
          status: 'completed',
          message: result.message,
          result: result.result,
        });

        if (executor.workflowStep) {
          await markWorkflowStep(executor.workflowStep, executor.workflowStatus || 'completed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateStep(stepId, { status: 'failed', error: errorMessage });

        if (executor.nonFatal) {
          // Non-fatal: log and continue
          console.error(`[executeSetupPlan] ${executor.name} failed (non-fatal):`, error);
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
    await completePlanInDB(dataset_id, progress);

    emitter.emit('vllora_workflow_updated', { datasetId: dataset_id });

    console.log('[executeSetupPlan] Execution complete:', executionId);

    return {
      success: true,
      execution_id: executionId,
      final_status: progress,
      summary,
    };
  } catch (error) {
    console.error('[executeSetupPlan] Failed:', error);
    const { dataset_id } = params as unknown as ExecuteSetupPlanParams;

    // Mark progress as complete+error (use real progress if available)
    if (progress) {
      progress.is_complete = true;
      progress.has_error = true;
      emitProgress(progress);
    }

    if (dataset_id) {
      failPlanInDB(dataset_id, progress ?? {
        dataset_id,
        current_step: 0,
        total_steps: 0,
        steps: [],
        is_complete: true,
        has_error: true,
      });
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
        ` To resume, call execute_setup_plan with steps_to_execute: [${remainingSteps.join(', ')}].` +
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

export const executeSetupPlanTool: DistriFnTool = {
  name: 'execute_setup_plan',
  description: `Execute an approved plan. Runs steps from the plan's steps_to_execute in order.

Available steps: ${STEP_ORDER.join(', ')}

The plan embeds which steps to run (steps_to_execute) and parameter overrides.
For fresh execution after plan approval, call with just dataset_id.
For smart resume, first call get_dataset_state, then pass only
the remaining steps via steps_to_execute.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
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
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await executeSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
