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
    const { workflow_id, script, model, temperature, max_tokens } = params;

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

    if (workflow.currentStep !== 'grader_config') {
      return { success: false, error: `Cannot configure grader in step ${workflow.currentStep}. Must be in grader_config step.` };
    }

    // Parse completion params with type coercion (LLM may pass strings)
    const modelValue = typeof model === 'string' ? model : 'gpt-4o';
    const temperatureValue = typeof temperature === 'number'
      ? temperature
      : typeof temperature === 'string'
        ? parseFloat(temperature) || 0.0
        : 0.0;
    const maxTokensValue = typeof max_tokens === 'number'
      ? max_tokens
      : typeof max_tokens === 'string'
        ? parseInt(max_tokens, 10) || 2048
        : 2048;

    // Build evaluation config (JavaScript evaluator only)
    const evaluationConfig: EvaluationConfig = {
      type: 'js',
      script,
      completionParams: {
        model: modelValue,
        temperature: temperatureValue,
        maxTokens: maxTokensValue,
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

    return {
      success: true,
      grader_type: 'js',
      model: modelValue,
      temperature: temperatureValue,
      max_tokens: maxTokensValue,
      configured_at: Date.now(),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to configure grader' };
  }
};

export const configureGraderTool: DistriFnTool = {
  name: 'configure_grader',
  description: 'Configure the JavaScript evaluation script for RFT. The script should define an evaluate(input, output) function that returns { score, reasoning }. Must be in grader_config step.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      script: {
        type: 'string',
        description: 'JavaScript code defining an evaluate(input, output) function. Use __langdb_call_llm_as_judge_obj(prompt) to call the LLM judge.',
      },
      model: {
        type: 'string',
        default: 'gpt-4o',
        description: 'LLM model for the judge (gpt-4o, gpt-4o-mini, claude-3-5-sonnet, claude-3-haiku)',
      },
      temperature: {
        type: 'number',
        default: 0.0,
        description: 'Temperature for LLM judge (0.0-2.0)',
      },
      max_tokens: {
        type: 'number',
        default: 2048,
        description: 'Max tokens for LLM judge response',
      },
    },
    required: ['workflow_id', 'script'],
  },
  handler: async (input) => JSON.stringify(await configureGraderHandler(input as Record<string, unknown>)),
} as DistriFnTool;
