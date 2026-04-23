/**
 * Test Grader Sample Tool
 *
 * Tests the configured grader on a small sample of records by running
 * a real evaluation via the backend pipeline. Returns actual scores
 * and reasoning instead of mock data.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService, recordService } from '@/services/service-registry';
import {
  createEvaluation,
  waitForEvaluationComplete,
  flattenEvaluationResults,
  updateDatasetEvalScript,
} from '@/services/finetune-api';
import type { TestGraderResult, ToolHandler } from '../types';

const DEFAULT_SAMPLE_SIZE = 5;
const MAX_SAMPLE_SIZE = 10;
const DEFAULT_MODEL = 'gpt-4o-mini';
// 40 attempts × 3s = 2 min max — plenty for 5-10 records
const POLL_MAX_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 3000;

/** Clamp sample size between 1 and MAX_SAMPLE_SIZE (or record count). */
function clampSampleSize(raw: unknown, recordCount: number): number {
  const size = typeof raw === 'number' ? raw : DEFAULT_SAMPLE_SIZE;
  return Math.min(Math.max(1, size), Math.min(MAX_SAMPLE_SIZE, recordCount));
}

/**
 * Run a real grader test on a sample of records.
 * Exported so `configure_grader` can reuse it for `auto_test`.
 *
 * Flow: ensure upload → sync eval script → create mini evaluation → poll → flatten results.
 */
export async function runGraderTest(
  workflowId: string,
  sampleSize: number,
  rolloutModel: string = DEFAULT_MODEL,
): Promise<TestGraderResult> {
  try {
    const dataset = await datasetService.getById(workflowId);
    if (!dataset?.evalScript) {
      return { success: false, error: 'Grader must be configured first' };
    }

    // Sync eval script to gateway before creating evaluation
    // (gateway auto-uploads dataset to cloud when creating eval)
    await updateDatasetEvalScript(workflowId, dataset.evalScript);

    const evalResponse = await createEvaluation({
      workflow_id: workflowId,
      rollout_model_params: { model: rolloutModel },
      offset: 0,
      limit: sampleSize,
    });

    const result = await waitForEvaluationComplete(
      evalResponse.evaluation_run_id,
      POLL_MAX_ATTEMPTS,
      POLL_INTERVAL_MS,
    );

    if (result.status === 'failed') {
      return { success: false, error: 'Evaluation failed on the backend' };
    }

    return buildTestResult(result.results, evalResponse.evaluation_run_id);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Grader test failed' };
  }
}

/** Map raw evaluation results into the TestGraderResult shape. */
function buildTestResult(
  rawResults: Parameters<typeof flattenEvaluationResults>[0],
  evaluationRunId: string,
): TestGraderResult {
  const flat = flattenEvaluationResults(rawResults);

  const results = flat.map((r) => ({
    record_id: r.dataset_row_id,
    row_index: r.row_index,
    score: r.score ?? 0,
    reason: r.reason ?? '',
    status: r.status,
  }));

  const scored = results.filter((r) => r.status === 'completed' || r.score > 0);
  const avgScore = scored.length > 0
    ? scored.reduce((sum, r) => sum + r.score, 0) / scored.length
    : 0;

  return {
    success: true,
    test_results: {
      sample_size: results.length,
      average_score: avgScore,
      results,
      evaluation_run_id: evaluationRunId,
      grader_type: 'js',
    },
  };
}

export const testGraderSampleHandler: ToolHandler = async (params) => {
  const { workflow_id, sample_size = DEFAULT_SAMPLE_SIZE, rollout_model = DEFAULT_MODEL } = params;

  if (!workflow_id || typeof workflow_id !== 'string') {
    return { success: false, error: 'workflow_id is required' };
  }

  const workflow = await workflowService.get(workflow_id);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  const validSteps = ['grader_config', 'dry_run', 'training'];
  if (!validSteps.includes(workflow.currentStep)) {
    return { success: false, error: `Cannot test grader in step ${workflow.currentStep}` };
  }

  const records = await recordService.getAllRecordsPaginated(workflow.workflowId);
  if (records.length === 0) {
    return { success: false, error: 'Dataset has no records' };
  }

  const sampleCount = clampSampleSize(sample_size, records.length);
  const model = typeof rollout_model === 'string' ? rollout_model : DEFAULT_MODEL;

  return runGraderTest(workflow.workflowId, sampleCount, model);
};

export const testGraderSampleTool: DistriFnTool = {
  name: 'test_grader_sample',
  description: 'Test the configured grader on a small sample of records using the real evaluation pipeline. Returns actual scores and reasoning (takes 1-2 minutes).',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      sample_size: { type: 'number', default: 5, description: 'Number of records to test (1-10, default 5)' },
      rollout_model: { type: 'string', default: 'gpt-4o-mini', description: 'Model for generating responses. Options: gpt-4o-mini, gpt-4o, gpt-4.1, gpt-4.1-mini' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await testGraderSampleHandler(input as Record<string, unknown>)),
} as DistriFnTool;
