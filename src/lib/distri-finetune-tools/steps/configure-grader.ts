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
    const { workflow_id, grader_type, config } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!grader_type || (grader_type !== 'llm_as_judge' && grader_type !== 'js')) {
      return { success: false, error: 'grader_type must be "llm_as_judge" or "js"' };
    }

    if (!config || typeof config !== 'object') {
      return { success: false, error: 'config object is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'grader_config') {
      return { success: false, error: `Cannot configure grader in step ${workflow.currentStep}. Must be in grader_config step.` };
    }

    // Build evaluation config
    let evaluationConfig: EvaluationConfig;

    if (grader_type === 'llm_as_judge') {
      const { prompt_template, output_schema, model, temperature, max_tokens } = config as Record<string, unknown>;

      if (!prompt_template || typeof prompt_template !== 'string') {
        return { success: false, error: 'prompt_template is required for llm_as_judge' };
      }

      evaluationConfig = {
        type: 'llm_as_judge',
        promptTemplate: prompt_template,
        outputSchema: typeof output_schema === 'string' ? output_schema : '{"type":"object","properties":{"score":{"type":"number"},"reasoning":{"type":"string"}},"required":["score","reasoning"]}',
        completionParams: {
          model: typeof model === 'string' ? model : 'gpt-4.1',
          temperature: typeof temperature === 'number' ? temperature : 0.0,
          maxTokens: typeof max_tokens === 'number' ? max_tokens : 1000,
        },
        updatedAt: Date.now(),
      };
    } else {
      const { script } = config as Record<string, unknown>;

      if (!script || typeof script !== 'string') {
        return { success: false, error: 'script is required for js evaluator' };
      }

      evaluationConfig = {
        type: 'js',
        script,
        completionParams: {
          model: 'gpt-4.1',
        },
        updatedAt: Date.now(),
      };
    }

    // Save full config to dataset (single source of truth)
    await datasetsDB.updateDatasetEvaluationConfig(workflow.datasetId, evaluationConfig);

    // Update workflow with metadata only (not the full config)
    await workflowDB.updateStepData(workflow_id, 'graderConfig', {
      type: grader_type as 'llm_as_judge' | 'js',
      configuredAt: Date.now(),
    });

    return {
      success: true,
      grader_type: grader_type,
      configured_at: Date.now(),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to configure grader' };
  }
};

export const configureGraderTool: DistriFnTool = {
  name: 'configure_grader',
  description: 'Configure the evaluation/grader function for RFT. Must be in grader_config step.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      grader_type: {
        type: 'string',
        enum: ['llm_as_judge', 'js'],
        description: 'Type of grader',
      },
      config: {
        type: 'object',
        description: 'Grader configuration. For llm_as_judge: { prompt_template, output_schema, model, temperature }. For js: { script }',
      },
    },
    required: ['workflow_id', 'grader_type', 'config'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await configureGraderHandler(input as Record<string, unknown>)),
} as DistriFnTool;
