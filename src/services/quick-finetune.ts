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

import * as workflowDB from './finetune-workflow-db';
import * as datasetsDB from './datasets-db';
import { uploadDatasetForFinetune, createFinetuneJobFromUpload } from './finetune-api';

export interface QuickFinetuneResult {
  success: boolean;
  error?: string;
  workflowId?: string;
  jobId?: string;
  status?: string;
}

export interface QuickFinetuneOptions {
  datasetId: string;
  baseModel?: string;
}

/**
 * Execute quick finetune - goes directly from dataset to training
 */
export async function quickFinetune(options: QuickFinetuneOptions): Promise<QuickFinetuneResult> {
  const { datasetId, baseModel = 'llama-v3-8b-instruct' } = options;

  try {
    // 1. Get dataset and validate
    const dataset = await datasetsDB.getDatasetById(datasetId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    // Check records exist
    const records = await datasetsDB.getRecordsByDatasetId(datasetId);
    if (records.length === 0) {
      return { success: false, error: 'Dataset has no records' };
    }

    // Check evaluator exists
    if (!dataset.evaluationConfig) {
      return { success: false, error: 'Dataset has no evaluation function configured' };
    }

    // 2. Get or create workflow
    let workflow = await workflowDB.getWorkflowByDataset(datasetId);

    if (!workflow) {
      // Create new workflow starting at grader_config (since we have evaluator)
      const trainingGoals = dataset.datasetObjective || 'Fine-tune model for this dataset';
      workflow = await workflowDB.createWorkflow(datasetId, trainingGoals);
    }

    // 3. Sync grader config from dataset to workflow
    if (!workflow.graderConfig) {
      await workflowDB.updateStepData(workflow.id, 'graderConfig', {
        type: dataset.evaluationConfig.type,
        configuredAt: dataset.evaluationConfig.updatedAt ?? Date.now(),
      });
    }

    // 4. Advance workflow to training step (skipping dry run)
    await workflowDB.advanceToStep(workflow.id, 'training');

    // 5. Upload dataset to backend if not already uploaded
    let backendDatasetId = dataset.backendDatasetId;

    if (!backendDatasetId) {
      const datasetWithRecords = { ...dataset, records };
      const uploadResult = await uploadDatasetForFinetune(datasetWithRecords);
      backendDatasetId = uploadResult.backendDatasetId;

      // Save backend ID
      await datasetsDB.updateDatasetBackendId(datasetId, backendDatasetId);
    }

    // 6. Start training job
    const job = await createFinetuneJobFromUpload(
      backendDatasetId,
      dataset.name,
      {
        baseModel,
        displayName: `${dataset.name} Fine-tune`,
      }
    );

    // 7. Update workflow with training info
    await workflowDB.updateStepData(workflow.id, 'training', {
      jobId: job.provider_job_id,
      baseModel,
      status: job.status as 'pending' | 'queued' | 'running' | 'completed' | 'failed',
      startedAt: Date.now(),
      progress: 0,
      metrics: null,
      modelId: job.fine_tuned_model || null,
    });

    return {
      success: true,
      workflowId: workflow.id,
      jobId: job.provider_job_id,
      status: job.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start quick finetune',
    };
  }
}
