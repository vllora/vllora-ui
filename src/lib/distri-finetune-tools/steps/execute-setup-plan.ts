/**
 * Execute Setup Plan Tool
 *
 * Orchestrates the execution of an approved setup plan.
 * Runs all steps sequentially: topics → data generation → grader → dry run → job setup
 *
 * Emits progress events for UI updates during execution.
 */

import type { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import * as workflowDB from '@/services/finetune-workflow-db';
import type { ToolHandler } from '../types';
import type { SetupPlan } from './propose-setup-plan';
import type { TopicHierarchyNode } from '@/types/dataset-types';

// =============================================================================
// Pending Plan Store (populated by UI event, consumed by handler)
// =============================================================================

let pendingApprovedPlan: { datasetId: string; plan: SetupPlan } | null = null;

// Listen for plan approval events from UI
emitter.on('vllora_setup_plan_approved', ({ datasetId, plan }) => {
  console.log('[executeSetupPlan] Received plan approval event for dataset:', datasetId);
  pendingApprovedPlan = { datasetId, plan: plan as SetupPlan };
  // Auto-clear after 60 seconds to avoid stale data
  setTimeout(() => {
    if (pendingApprovedPlan?.datasetId === datasetId) {
      pendingApprovedPlan = null;
    }
  }, 60000);
});

/**
 * Get and consume the pending approved plan for a dataset
 */
export function consumePendingPlan(datasetId: string): SetupPlan | null {
  console.log('[executeSetupPlan] Attempting to consume pending plan for:', datasetId);
  console.log('[executeSetupPlan] Current pending plan:', pendingApprovedPlan?.datasetId);
  if (pendingApprovedPlan?.datasetId === datasetId) {
    const plan = pendingApprovedPlan.plan;
    pendingApprovedPlan = null;
    console.log('[executeSetupPlan] Successfully consumed pending plan');
    return plan;
  }
  console.log('[executeSetupPlan] No pending plan found');
  return null;
}

// Import step handlers
import { applyTopicHierarchyHandler } from './apply-hierarchy';
import { generateInitialDataHandler } from './generate-initial-data';
import { categorizeRecordsHandler } from './categorize-records';
import { uploadDatasetHandler } from './upload-dataset';
import { runDryRunHandler } from './run-dry-run';

// =============================================================================
// Types
// =============================================================================

interface ExecuteSetupPlanParams {
  dataset_id: string;
  plan: SetupPlan;
}

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

interface ExecuteSetupPlanResult {
  success: boolean;
  error?: string;
  execution_id?: string;
  final_status?: ExecutionProgress;
  summary?: {
    topics_created: number;
    records_generated: number;
    grader_configured: boolean;
    dry_run_completed: boolean;
    dry_run_pass_rate?: number;
    ready_to_finetune: boolean;
  };
}

// =============================================================================
// Progress Emission
// =============================================================================

function emitProgress(progress: ExecutionProgress): void {
  // Emit to event bus for UI updates
  emitter.emit('vllora_setup_plan_progress' as any, { progress });
}

// =============================================================================
// Helper: Convert proposed topics to hierarchy format
// =============================================================================

function generateTopicId(): string {
  return `topic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function convertToHierarchyNodes(
  proposedTopics: SetupPlan['proposed_topics']
): TopicHierarchyNode[] {
  return proposedTopics.map((topic) => ({
    id: generateTopicId(),
    name: topic.name,
    children: topic.subtopics?.map((sub) => ({
      id: generateTopicId(),
      name: sub.name,
      children: [],
    })) || [],
  }));
}

// =============================================================================
// Main Handler
// =============================================================================

export const executeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ExecuteSetupPlanResult> => {
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    console.log('[executeSetupPlan] Starting execution:', executionId);

    const { dataset_id, plan: planFromParams } = params as unknown as ExecuteSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Try to get plan from params first, otherwise check pending approved plan
    const plan = planFromParams || consumePendingPlan(dataset_id);

    if (!plan) {
      return { success: false, error: 'No plan provided. Please approve a setup plan first.' };
    }

    // Verify dataset exists
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Get or create workflow for this dataset
    let workflow = await workflowDB.getWorkflowByDataset(dataset_id);
    if (!workflow) {
      console.log('[executeSetupPlan] Creating new workflow for dataset:', dataset_id);
      workflow = await workflowDB.createWorkflow(dataset_id, dataset.datasetObjective || 'Setup plan execution');
    }
    const workflow_id = workflow.id;
    console.log('[executeSetupPlan] Using workflow:', workflow_id);

    // Initialize progress tracking
    const steps: ExecutionStep[] = [
      { id: 'topics', name: 'Apply Topic Hierarchy', status: 'pending' },
      { id: 'generate', name: 'Generate Initial Data', status: 'pending' },
      { id: 'categorize', name: 'Categorize Records', status: 'pending' },
      { id: 'grader', name: 'Configure Evaluator', status: 'pending' },
      { id: 'upload', name: 'Upload Dataset', status: 'pending' },
      { id: 'dryrun', name: 'Run Dry Run', status: 'pending' },
    ];

    const progress: ExecutionProgress = {
      dataset_id,
      current_step: 0,
      total_steps: steps.length,
      steps,
      is_complete: false,
      has_error: false,
    };

    // Helper to update step status
    const updateStep = (
      stepId: string,
      updates: Partial<ExecutionStep>
    ): void => {
      const step = progress.steps.find((s) => s.id === stepId);
      if (step) {
        Object.assign(step, updates);
        emitProgress(progress);
      }
    };

    // Summary tracking
    const summary = {
      topics_created: 0,
      records_generated: 0,
      grader_configured: false,
      dry_run_completed: false,
      dry_run_pass_rate: undefined as number | undefined,
      ready_to_finetune: false,
    };

    // =========================================================================
    // Step 1: Apply Topic Hierarchy
    // =========================================================================
    progress.current_step = 1;
    updateStep('topics', { status: 'running', message: 'Applying topic hierarchy...' });

    try {
      const hierarchyNodes = convertToHierarchyNodes(plan.proposed_topics);

      const topicsResult = await applyTopicHierarchyHandler({
        workflow_id,
        hierarchy: hierarchyNodes,
      });

      if (!(topicsResult as any).success) {
        throw new Error((topicsResult as any).error || 'Failed to apply topic hierarchy');
      }

      summary.topics_created = plan.total_topic_count;
      updateStep('topics', {
        status: 'completed',
        message: `Applied ${plan.total_topic_count} topics`,
        result: topicsResult,
      });

      // Switch to Records tab to show the applied topics
      emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'records' });
    } catch (error) {
      updateStep('topics', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      progress.has_error = true;
      throw error;
    }

    // =========================================================================
    // Step 2: Generate Initial Data
    // =========================================================================
    progress.current_step = 2;
    updateStep('generate', {
      status: 'running',
      message: `Generating ${plan.data_generation.seed_count} training examples...`,
      progress: 0,
    });

    try {
      const generateResult = await generateInitialDataHandler({
        dataset_id,
        count: plan.data_generation.seed_count,
        use_knowledge: plan.data_generation.grounded_in_knowledge,
        distribute_by_topic: true,
      });

      if (!(generateResult as any).success) {
        throw new Error((generateResult as any).error || 'Failed to generate data');
      }

      summary.records_generated = (generateResult as any).records_created || plan.data_generation.seed_count;
      updateStep('generate', {
        status: 'completed',
        message: `Generated ${summary.records_generated} training examples`,
        result: generateResult,
      });
    } catch (error) {
      updateStep('generate', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      progress.has_error = true;
      throw error;
    }

    // =========================================================================
    // Step 3: Categorize Records
    // =========================================================================
    progress.current_step = 3;
    updateStep('categorize', {
      status: 'running',
      message: 'Categorizing records into topics...',
    });

    try {
      const categorizeResult = await categorizeRecordsHandler({
        workflow_id,
        confidence_threshold: 0.7,
      });

      if (!(categorizeResult as any).success) {
        throw new Error((categorizeResult as any).error || 'Failed to categorize records');
      }

      const assignedCount = (categorizeResult as any).categorization?.assigned_count || 0;
      updateStep('categorize', {
        status: 'completed',
        message: `Categorized ${assignedCount} records into topics`,
        result: categorizeResult,
      });
    } catch (error) {
      updateStep('categorize', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      progress.has_error = true;
      throw error;
    }

    // =========================================================================
    // Step 4: Configure Grader
    // =========================================================================
    progress.current_step = 4;
    updateStep('grader', { status: 'running', message: 'Configuring evaluation grader...' });

    try {
      // Generate a placeholder eval script based on the plan criteria
      // The user can customize this later in the Evaluator tab
      const criteriaComments = plan.grader_config.criteria
        .map((c, i) => ` * ${i + 1}. ${c}`)
        .join('\n');

      const evalScript = `/**
 * Auto-generated evaluation script
 *
 * Criteria to evaluate:
${criteriaComments}
 *
 * Passing threshold: ${plan.grader_config.passing_threshold}
 *
 * TODO: Customize this script to properly evaluate responses based on your criteria.
 */
function evaluate(input, output) {
  // Placeholder implementation - always returns passing score
  // Replace this with actual evaluation logic
  return {
    score: ${plan.grader_config.passing_threshold},
    reasoning: "Auto-generated placeholder. Please customize this evaluator."
  };
}`;

      // Save eval script directly to dataset
      await datasetsDB.updateDatasetEvalScript(dataset_id, evalScript);

      // Update workflow grader config metadata
      await workflowDB.updateStepData(workflow_id, 'graderConfig', {
        type: 'js',
        configuredAt: Date.now(),
      });

      summary.grader_configured = true;
      updateStep('grader', {
        status: 'completed',
        message: 'Evaluation grader configured (placeholder - customize in Evaluator tab)',
        result: { success: true, grader_type: 'js' },
      });
    } catch (error) {
      updateStep('grader', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      progress.has_error = true;
      throw error;
    }

    // =========================================================================
    // Step 5: Upload Dataset
    // =========================================================================
    progress.current_step = 5;
    updateStep('upload', { status: 'running', message: 'Uploading dataset to backend...' });

    try {
      const uploadResult = await uploadDatasetHandler({
        workflow_id,
        force_reupload: true,
      });

      if (!(uploadResult as any).success && !(uploadResult as any).already_uploaded) {
        throw new Error((uploadResult as any).error || 'Failed to upload dataset');
      }

      updateStep('upload', {
        status: 'completed',
        message: 'Dataset uploaded',
        result: uploadResult,
      });
    } catch (error) {
      updateStep('upload', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      progress.has_error = true;
      throw error;
    }

    // =========================================================================
    // Step 6: Run Dry Run
    // =========================================================================
    progress.current_step = 6;
    updateStep('dryrun', {
      status: 'running',
      message: 'Running dry run evaluation...',
      progress: 0,
    });

    try {
      // Calculate sample percentage (aim for ~10 samples, but use percentage)
      const targetSamples = Math.min(summary.records_generated, 10);
      const samplePercentage = summary.records_generated > 0
        ? Math.ceil((targetSamples / summary.records_generated) * 100)
        : 100;

      const dryRunResult = await runDryRunHandler({
        workflow_id,
        sample_percentage: samplePercentage,
      });

      if (!(dryRunResult as any).success) {
        throw new Error((dryRunResult as any).error || 'Failed to run dry run');
      }

      summary.dry_run_completed = true;
      summary.dry_run_pass_rate = (dryRunResult as any).stats?.pass_rate;
      summary.ready_to_finetune = true;

      updateStep('dryrun', {
        status: 'completed',
        message: `Dry run started in background`,
        result: dryRunResult,
      });
    } catch (error) {
      // Dry run failure is not fatal - we can still proceed
      updateStep('dryrun', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Mark as ready anyway - user can retry dry run
      summary.ready_to_finetune = summary.records_generated > 0 && summary.grader_configured;
    }

    // =========================================================================
    // Complete
    // =========================================================================
    progress.is_complete = true;
    emitProgress(progress);

    // Emit workflow updated event to trigger refresh in UI
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Setup plan execution failed',
      execution_id: executionId,
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const executeSetupPlanTool: DistriFnTool = {
  name: 'execute_setup_plan',
  description: `Execute an approved setup plan to automatically configure the dataset.

This tool runs all setup steps sequentially:
1. Apply topic hierarchy
2. Generate initial training data
3. Categorize records into topics
4. Configure evaluation grader
5. Upload dataset to backend
6. Run dry run evaluation

Use this tool ONLY after the user has approved a plan from propose_setup_plan.
When the user says "I approve the setup plan" or similar, call this tool with just the dataset_id.
The approved plan is automatically retrieved from the UI approval event.

The tool emits progress events so the UI can show real-time updates.
After completion, the dataset is ready for fine-tuning.`,
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
        description: 'Optional: The setup plan. If not provided, retrieves from UI approval.',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await executeSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
