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
import type { ToolHandler } from '../types';
import type { SetupPlan } from './propose-setup-plan';
import type { TopicHierarchyNode } from '@/types/dataset-types';

// Import step handlers
import { applyTopicHierarchyHandler } from './apply-hierarchy';
import { generateInitialDataHandler } from './generate-initial-data';
import { configureGraderHandler } from './configure-grader';
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

    const { dataset_id, plan } = params as unknown as ExecuteSetupPlanParams;

    if (!dataset_id || !plan) {
      return { success: false, error: 'dataset_id and plan are required' };
    }

    // Verify dataset exists
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Initialize progress tracking
    const steps: ExecutionStep[] = [
      { id: 'topics', name: 'Apply Topic Hierarchy', status: 'pending' },
      { id: 'generate', name: 'Generate Initial Data', status: 'pending' },
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
        dataset_id,
        hierarchy: hierarchyNodes,
        version: '1.0',
        generated_by: 'setup_plan',
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
    // Step 3: Configure Grader
    // =========================================================================
    progress.current_step = 3;
    updateStep('grader', { status: 'running', message: 'Configuring evaluation grader...' });

    try {
      const graderResult = await configureGraderHandler({
        dataset_id,
        grader_type: 'llm_judge',
        config: {
          criteria: plan.grader_config.criteria,
          passing_threshold: plan.grader_config.passing_threshold,
        },
      });

      if (!(graderResult as any).success) {
        throw new Error((graderResult as any).error || 'Failed to configure grader');
      }

      summary.grader_configured = true;
      updateStep('grader', {
        status: 'completed',
        message: 'Evaluation grader configured',
        result: graderResult,
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
    // Step 4: Upload Dataset
    // =========================================================================
    progress.current_step = 4;
    updateStep('upload', { status: 'running', message: 'Uploading dataset to backend...' });

    try {
      const uploadResult = await uploadDatasetHandler({
        dataset_id,
      });

      if (!(uploadResult as any).success) {
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
    // Step 5: Run Dry Run
    // =========================================================================
    progress.current_step = 5;
    updateStep('dryrun', {
      status: 'running',
      message: 'Running dry run evaluation...',
      progress: 0,
    });

    try {
      const dryRunResult = await runDryRunHandler({
        dataset_id,
        sample_size: Math.min(summary.records_generated, 10),
      });

      if (!(dryRunResult as any).success) {
        throw new Error((dryRunResult as any).error || 'Failed to run dry run');
      }

      summary.dry_run_completed = true;
      summary.dry_run_pass_rate = (dryRunResult as any).stats?.pass_rate;
      summary.ready_to_finetune = true;

      updateStep('dryrun', {
        status: 'completed',
        message: `Dry run complete (${Math.round((summary.dry_run_pass_rate || 0) * 100)}% pass rate)`,
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
3. Configure evaluation grader
4. Upload dataset to backend
5. Run dry run evaluation

Use this tool ONLY after the user has approved a plan from propose_setup_plan.

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
        description: 'The approved setup plan from propose_setup_plan',
      },
    },
    required: ['dataset_id', 'plan'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await executeSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
