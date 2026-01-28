/**
 * Deploy Model Tool
 *
 * Deploys the fine-tuned model for use.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import type { ToolHandler } from '../types';

export const deployModelHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, deployment_name } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'deployment') {
      return { success: false, error: `Cannot deploy in step ${workflow.currentStep}. Must be in deployment step.` };
    }

    if (!workflow.training || workflow.training.status !== 'completed') {
      return { success: false, error: 'Training must be completed before deployment' };
    }

    // TODO: Actually deploy model
    const modelId = `ft:${workflow.training.baseModel}:${workflow.training.jobId}`;
    const name = typeof deployment_name === 'string' ? deployment_name : `finetune-${workflow.datasetId}`;

    // Update workflow
    await workflowDB.updateStepData(workflow_id, 'deployment', {
      modelId,
      deploymentName: name,
      deployedAt: Date.now(),
      endpoint: `/v1/chat/completions`,
    });

    // Mark workflow as completed
    await workflowDB.advanceToStep(workflow_id, 'completed');

    return {
      success: true,
      deployment: {
        model_id: modelId,
        deployment_name: name,
        endpoint: `/v1/chat/completions`,
        status: 'deployed',
        deployed_at: Date.now(),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to deploy model' };
  }
};

export const deployModelTool: DistriFnTool = {
  name: 'deploy_model',
  description: 'Deploy the fine-tuned model for use.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      deployment_name: { type: 'string', description: 'Name for the deployment' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await deployModelHandler(input as Record<string, unknown>)),
} as DistriFnTool;
