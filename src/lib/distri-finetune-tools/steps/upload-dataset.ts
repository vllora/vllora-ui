/**
 * Upload Dataset Tool
 *
 * Uploads the dataset to the backend for evaluation and training.
 * This must be called before dry run or training can be started.
 * Includes topic hierarchy and evaluator config if configured.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import { uploadDatasetForFinetune } from '@/services/finetune-api';
import type { ToolHandler } from '../types';

export const uploadDatasetHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, force_reupload = false } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get dataset with records
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    // Check if already uploaded and not forcing reupload
    if (dataset.backendDatasetId && !force_reupload) {
      return {
        success: true,
        already_uploaded: true,
        backend_dataset_id: dataset.backendDatasetId,
        message: 'Dataset already uploaded to backend. Use force_reupload=true to re-upload.',
      };
    }

    // Get records
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    if (records.length === 0) {
      return { success: false, error: 'Dataset has no records to upload' };
    }

    // Build dataset with records for upload
    const datasetWithRecords = {
      ...dataset,
      records,
    };

    // Upload to backend (includes topic hierarchy and evaluator if configured)
    const { backendDatasetId, jsonlContent } = await uploadDatasetForFinetune(datasetWithRecords);

    // Save backend dataset ID to local dataset
    await datasetsDB.updateDatasetBackendId(workflow.datasetId, backendDatasetId);

    // Count what was included
    const hasTopicHierarchy = !!dataset.topicHierarchy?.hierarchy?.length;
    const hasEvaluator = !!dataset.evaluationConfig;

    return {
      success: true,
      backend_dataset_id: backendDatasetId,
      records_uploaded: records.length,
      jsonl_size_bytes: jsonlContent.length,
      included: {
        topic_hierarchy: hasTopicHierarchy,
        evaluator: hasEvaluator,
      },
      message: hasEvaluator
        ? 'Dataset uploaded with evaluator config. Ready for dry run.'
        : 'Dataset uploaded without evaluator. Configure grader before dry run.',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to upload dataset' };
  }
};

export const uploadDatasetTool: DistriFnTool = {
  name: 'upload_dataset',
  description: 'Upload the dataset to the backend for evaluation and training. Must be called before dry run or training. Re-upload if evaluator config changes.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      force_reupload: { type: 'boolean', default: false, description: 'Force re-upload even if already uploaded' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await uploadDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
