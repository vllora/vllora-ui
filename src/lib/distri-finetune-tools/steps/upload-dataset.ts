/**
 * Upload Dataset Tool
 *
 * Uploads the dataset to the backend for evaluation and training.
 * This must be called before dry run or training can be started.
 * Includes topic hierarchy and evaluator config if configured.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService, recordService } from '@/services/service-registry';
import { uploadDatasetForFinetune } from '@/services/finetune-api';
import type { ToolHandler } from '../types';

export const uploadDatasetHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get dataset with records
    const dataset = await datasetService.getById(workflow.workflowId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    // The dataset ID is the backend dataset ID — they are always the same.
    const workflowId = dataset.id;

    // Get records
    const records = await recordService.getByDatasetId(workflow.workflowId);
    if (records.length === 0) {
      return { success: false, error: 'Dataset has no records to upload' };
    }

    // Build dataset with records for upload
    const datasetWithRecords = {
      ...dataset,
      records,
    };

    // Upload to backend (includes topic hierarchy and evaluator if configured)
    const { jsonlContent } = await uploadDatasetForFinetune(datasetWithRecords);

    // Count what was included
    const hasTopicHierarchy = !!dataset.topicHierarchy?.hierarchy?.length;
    const hasEvalScript = !!dataset.evalScript;

    return {
      success: true,
      backend_workflow_id: workflowId,
      records_uploaded: records.length,
      jsonl_size_bytes: jsonlContent.length,
      included: {
        topic_hierarchy: hasTopicHierarchy,
        eval_script: hasEvalScript,
      },
      message: hasEvalScript
        ? 'Dataset uploaded with eval script. Ready for evaluation.'
        : 'Dataset uploaded without eval script. Configure grader before evaluation.',
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
  handler: async (input) => JSON.stringify(await uploadDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
