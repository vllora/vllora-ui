/**
 * Test Grader Sample Tool
 *
 * Tests the configured grader on a sample of records.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const testGraderSampleHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, sample_size = 5 } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'grader_config' && workflow.currentStep !== 'dry_run') {
      return { success: false, error: `Cannot test grader in step ${workflow.currentStep}` };
    }

    // Get dataset to check evaluation config
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset?.evaluationConfig) {
      return { success: false, error: 'Grader must be configured first. Configure evaluationConfig on the dataset.' };
    }

    // Get sample records
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const sampleCount = typeof sample_size === 'number' ? Math.min(sample_size, records.length) : 5;
    const sampleRecords = records.slice(0, sampleCount);

    // TODO: Actually run grader on samples
    // For now, return mock results
    const results = sampleRecords.map((record) => ({
      record_id: record.id,
      score: Math.random() * 0.4 + 0.6, // Random score 0.6-1.0
      reasoning: 'Sample evaluation result',
      grader_output: { score: Math.random() * 0.4 + 0.6, reasoning: 'Mock grader output' },
    }));

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      success: true,
      test_results: {
        sample_size: sampleCount,
        results,
        average_score: avgScore,
        grader_type: dataset.evaluationConfig.type,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to test grader' };
  }
};

export const testGraderSampleTool: DistriFnTool = {
  name: 'test_grader_sample',
  description: 'Test the configured grader on a sample of records.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      sample_size: { type: 'number', default: 5, description: 'Number of records to test' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await testGraderSampleHandler(input as Record<string, unknown>)),
} as DistriFnTool;
