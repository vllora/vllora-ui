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
import { uploadDatasetHandler } from './upload-dataset';
import { runDryRunHandler } from './run-dry-run';

// Import for README generation
import * as knowledgeDB from '@/services/knowledge-sources-db';
import { generateDatasetReadme, type KnowledgeSourceInfo, type SetupPlanSummary } from '@/services/dataset-readme-generator';

// Import for finetune job creation
import { quickFinetune } from '@/services/quick-finetune';

// Side-effect import to ensure execution state store is listening for progress events
import './execution-state-store';

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
    // Note: Records are assigned to topics during generation (distribute_by_topic=true)
    const steps: ExecutionStep[] = [
      { id: 'topics', name: 'Apply Topic Hierarchy', status: 'pending' },
      { id: 'generate', name: 'Generate Initial Data', status: 'pending' },
      { id: 'grader', name: 'Configure Evaluator', status: 'pending' },
      { id: 'upload', name: 'Upload Dataset', status: 'pending' },
      { id: 'dryrun', name: 'Run Dry Run', status: 'pending' },
      { id: 'readme', name: 'Generate README', status: 'pending' },
      { id: 'finetune', name: 'Start Finetune Job', status: 'pending' },
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
      finetune_job_id: undefined as string | undefined,
      finetune_job_status: undefined as string | undefined,
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
    // Use estimated_records (sum of topic target counts)
    const targetRecordCount = plan.estimated_records;
    updateStep('generate', {
      status: 'running',
      message: `Generating ${targetRecordCount} training examples...`,
      progress: 0,
    });

    try {
      const generateResult = await generateInitialDataHandler({
        dataset_id,
        count: targetRecordCount,
        use_knowledge: plan.data_generation.grounded_in_knowledge,
        distribute_by_topic: true,
      });

      if (!(generateResult as any).success) {
        throw new Error((generateResult as any).error || 'Failed to generate data');
      }

      summary.records_generated = (generateResult as any).records_created || targetRecordCount;
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
      // Use the pre-generated LLM-as-judge evaluator template from the plan
      // This was already generated by grader-template.ts based on the criteria
      const evalScript = plan.grader_config.template_preview;

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
        message: 'LLM-as-judge evaluator configured',
        result: { success: true, grader_type: 'llm-as-judge' },
      });

      // Switch to Evaluator tab to show the configured grader
      emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'evaluator' });
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
    // Step 5: Run Dry Run
    // =========================================================================
    progress.current_step = 5;
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
    // Step 6: Generate README
    // =========================================================================
    progress.current_step = 6;
    updateStep('readme', { status: 'running', message: 'Generating README documentation...' });

    try {
      // Get fresh dataset and records
      const updatedDataset = await datasetsDB.getDatasetById(dataset_id);
      const allRecords = await datasetsDB.getRecordsByDatasetId(dataset_id);

      // Get knowledge sources for data provenance
      const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
      const knowledgeSources: KnowledgeSourceInfo[] = sources
        .filter(s => s.status === 'ready')
        .map(s => ({
          name: s.name,
          type: s.type,
          topics_extracted: s.extractedContent?.topics || [],
          size: s.size,
        }));

      // Create setup plan summary
      const setupPlanSummary: SetupPlanSummary = {
        executed_at: Date.now(),
        topics_created: summary.topics_created,
        records_generated: summary.records_generated,
        grader_configured: summary.grader_configured,
        dry_run_completed: summary.dry_run_completed,
      };

      // Generate README with full context
      const readme = generateDatasetReadme({
        dataset: updatedDataset!,
        records: allRecords,
        workflow,
        knowledgeSources,
        setupPlanSummary,
      });

      // Save README to dataset
      await datasetsDB.updateDatasetReadme(dataset_id, readme);

      updateStep('readme', {
        status: 'completed',
        message: 'README generated with data provenance and statistics',
      });

      console.log('[executeSetupPlan] README generated successfully');
    } catch (error) {
      // README failure is not fatal
      updateStep('readme', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to generate README',
      });
      console.error('[executeSetupPlan] README generation failed:', error);
    }

    // =========================================================================
    // Step 7: Start Finetune Job
    // =========================================================================
    progress.current_step = 7;
    updateStep('finetune', { status: 'running', message: 'Creating finetune job...' });

    try {
      // Get the backend dataset ID from the uploaded dataset
      const datasetForJob = await datasetsDB.getDatasetById(dataset_id);
      if (!datasetForJob?.backendDatasetId) {
        throw new Error('Dataset not uploaded to backend');
      }

      // Start the finetune training job
      const finetuneResult = await quickFinetune({
        datasetId: dataset_id,
        baseModel: 'llama-v3-8b-instruct',
      });

      if (!finetuneResult.success) {
        throw new Error(finetuneResult.error || 'Failed to create finetune job');
      }

      summary.finetune_job_id = finetuneResult.jobId;
      summary.finetune_job_status = finetuneResult.status;

      updateStep('finetune', {
        status: 'completed',
        message: `Finetune job started: ${finetuneResult.jobId}`,
        result: finetuneResult,
      });

      // Emit event so FinetuneJobsContext can refresh
      emitter.emit('vllora_finetune_job_created', {
        backendDatasetId: datasetForJob.backendDatasetId,
        jobId: finetuneResult.jobId,
      });

      // Switch to Jobs tab to show the finetune job progress
      emitter.emit('vllora_switch_tab', { datasetId: dataset_id, tab: 'jobs' });

      console.log('[executeSetupPlan] Finetune job created:', finetuneResult.jobId);
    } catch (error) {
      // Finetune job creation failure is not fatal - user can start manually
      updateStep('finetune', {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to start finetune job',
      });
      console.error('[executeSetupPlan] Finetune job creation failed:', error);
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
  description: `Execute an approved setup plan to automatically configure the dataset and start fine-tuning.

This tool runs all setup steps sequentially:
1. Apply topic hierarchy
2. Generate initial training data (distributed by topic - records are assigned during generation)
3. Configure evaluation grader
4. Upload dataset to backend
5. Run dry run evaluation
6. Generate README documentation (includes data provenance, statistics, and structure)
7. Start finetune job (automatically creates and submits the training job)

Use this tool ONLY after the user has approved a plan from propose_setup_plan.
When the user says "I approve the setup plan" or similar, call this tool with just the dataset_id.
The approved plan is automatically retrieved from the UI approval event.

The tool emits progress events so the UI can show real-time updates.
After completion, the finetune job is started automatically - no manual intervention needed.`,
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
