/**
 * Quick Finetune Service
 *
 * Provides a direct path to start finetuning when:
 * - Dataset has records
 * - Evaluation function is already configured
 *
 * This bypasses Lucy and directly:
 * 1. Creates/gets workflow
 * 2. Advances to training step
 * 3. Uploads dataset to backend
 * 4. Starts the training job
 */

import { datasetService, recordService, workflowService } from './service-registry';
import {
  createFinetuneJobFromUpload,
  listFinetuneJobs,
  FinetuneTrainingConfig,
  FinetuneInferenceParameters,
} from './finetune-api';
import { emitter } from '@/utils/eventEmitter';

export interface QuickFinetuneResult {
  success: boolean;
  error?: string;
  workflowId?: string;
  jobId?: string;
  status?: string;
}

/** Training configuration options for finetune jobs */
export interface TrainingConfigOptions {
  /** Training hyperparameters */
  trainingConfig?: Partial<FinetuneTrainingConfig>;
  /** Inference parameters during training */
  inferenceParameters?: Partial<FinetuneInferenceParameters>;
  /** Chunk size for training data processing */
  chunkSize?: number;
  /** Number of nodes for distributed training */
  nodeCount?: number;
}

export interface QuickFinetuneOptions extends TrainingConfigOptions {
  workflowId: string;
  baseModel?: string;
}

// ============================================================================
// Common Types for startFinetuneTraining
// ============================================================================

export interface StartFinetuneTrainingOptions extends TrainingConfigOptions {
  /** Workflow ID (dataset must already be uploaded) */
  workflowId: string;
  /** Dataset name for display */
  datasetName: string;
  /** Base model to fine-tune */
  baseModel?: string;
}

export interface StartFinetuneTrainingResult {
  success: boolean;
  error?: string;
  jobId?: string;
  status?: string;
  fineTunedModel?: string;
}

// ============================================================================
// Core Function - Used by both quickFinetune and startTrainingHandler
// ============================================================================

/**
 * Start a finetune training job
 *
 * This is the core function that creates the job and updates the workflow.
 * Prerequisites:
 * - Dataset must already be uploaded
 * - Workflow must exist
 *
 * Both quickFinetune and startTrainingHandler use this function.
 */
export async function startFinetuneTraining(
  options: StartFinetuneTrainingOptions
): Promise<StartFinetuneTrainingResult> {
  const {
    workflowId,
    datasetName,
    baseModel = 'Qwen3.5-4B',
    trainingConfig,
    inferenceParameters,
    chunkSize,
    nodeCount,
  } = options;

  try {
    // Check for existing running/pending jobs for this dataset
    const existingJobs = await listFinetuneJobs(workflowId);
    const activeJob = existingJobs.find(
      (job) => job.status === 'pending' || job.status === 'running'
    );

    if (activeJob) {
      const activeJobId = activeJob.provider_job_id || activeJob.id;
      return {
        success: false,
        error: `A finetune job is already in progress (${activeJobId}). Wait for it to complete before starting a new one.`,
      };
    }

    // Create the finetune job via backend API
    const job = await createFinetuneJobFromUpload(
      workflowId,
      datasetName,
      {
        baseModel,
        displayName: `${datasetName} Fine-tune`,
        trainingConfig,
        inferenceParameters,
        chunkSize,
        nodeCount,
      }
    );

    // Use provider_job_id (from list endpoint) or id (from create endpoint) as fallback
    const jobId = job.provider_job_id || job.id;

    // Update workflow with training info
    await workflowService.updateStepData(workflowId, 'training', {
      jobId,
      baseModel,
      status: job.status as 'pending' | 'queued' | 'running' | 'completed' | 'failed',
      startedAt: Date.now(),
      progress: 0,
      metrics: null,
      modelId: job.fine_tuned_model || null,
    });

    return {
      success: true,
      jobId,
      status: job.status,
      fineTunedModel: job.fine_tuned_model,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start training job',
    };
  }
}

/**
 * Execute quick finetune - goes directly from dataset to training
 *
 * This function handles all the setup (workflow creation, dataset upload)
 * and then calls the common startFinetuneTraining function.
 */
export async function quickFinetune(options: QuickFinetuneOptions): Promise<QuickFinetuneResult> {
  const {
    workflowId,
    baseModel = 'Qwen3.5-4B',
    trainingConfig,
    inferenceParameters,
    chunkSize,
    nodeCount,
  } = options;

  try {
    // 1. Get dataset and validate
    const dataset = await datasetService.getById(workflowId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    // Check records exist
    const recordCount = await recordService.getCount(workflowId);
    if (recordCount === 0) {
      return { success: false, error: 'Dataset has no records' };
    }

    // Check eval script exists
    if (!dataset.evalScript) {
      return { success: false, error: 'Dataset has no evaluation script configured' };
    }

    // 2. Get or create workflow
    let workflow = await workflowService.getByDataset(workflowId);

    if (!workflow) {
      // Create new workflow starting at grader_config (since we have evaluator)
      const trainingGoals = dataset.datasetObjective || 'Fine-tune model for this dataset';
      workflow = await workflowService.create(workflowId, trainingGoals);
    }

    // 3. Sync grader config from dataset to workflow
    if (!workflow.graderConfig) {
      await workflowService.updateStepData(workflow.id, 'graderConfig', {
        type: 'js',
        configuredAt: Date.now(),
      });
    }

    // 4. Advance workflow to training step (skipping dry run)
    await workflowService.advanceToStep(workflow.id, 'training');

    // 5. Start training job (gateway auto-uploads dataset to cloud)
    // 6. Start training job using common function
    const result = await startFinetuneTraining({
      workflowId: workflow.id,
      datasetName: dataset.name,
      baseModel,
      trainingConfig,
      inferenceParameters,
      chunkSize,
      nodeCount,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Emit event so FinetuneJobsContext can refresh
    emitter.emit('vllora_finetune_job_created', { workflowId });

    return {
      success: true,
      workflowId: workflow.id,
      jobId: result.jobId,
      status: result.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start quick finetune',
    };
  }
}
