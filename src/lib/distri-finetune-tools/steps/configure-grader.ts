/**
 * Configure Grader Tool
 *
 * Configures the evaluation/grader function for RFT.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { EvaluationConfig } from '@/types/dataset-types';
import type { ToolHandler } from '../types';

export const configureGraderHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, script } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!script || typeof script !== 'string') {
      return { success: false, error: 'script is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }
    // Auto-advance to grader_config if in earlier step
    if (workflow.currentStep !== 'grader_config') {
      await workflowDB.advanceToStep(workflow_id, 'grader_config');
    }

    // Build evaluation config (JavaScript evaluator only)
    // Use default completion params (required by type but not needed for pure JS evaluation)
    const evaluationConfig: EvaluationConfig = {
      type: 'js',
      script,
      completionParams: {
        model: 'gpt-4o',
        temperature: 0.0,
        maxTokens: 2048,
      },
      updatedAt: Date.now(),
    };

    // Save full config to dataset (single source of truth)
    await datasetsDB.updateDatasetEvaluationConfig(workflow.datasetId, evaluationConfig);

    // Update workflow with metadata only (not the full config)
    await workflowDB.updateStepData(workflow_id, 'graderConfig', {
      type: 'js',
      configuredAt: Date.now(),
    });

    // Switch to Evaluator tab so user can see the configured grader
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('finetune-set-view-mode', {
          detail: { section: 'evaluator' },
        })
      );
    }

    return {
      success: true,
      grader_type: 'js',
      configured_at: Date.now(),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to configure grader' };
  }
};

export const configureGraderTool: DistriFnTool = {
  name: 'configure_grader',
  description: 'Configure the JavaScript evaluation script for RFT. The script should define an evaluate(input, output) function that returns { score, reasoning }.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      script: {
        type: 'string',
        description: 'JavaScript code defining an evaluate(input, output) function that returns { score: number, reasoning: string }.',
      },
    },
    required: ['workflow_id', 'script'],
  },
  handler: async (input) => JSON.stringify(await configureGraderHandler(input as Record<string, unknown>)),
} as DistriFnTool;
