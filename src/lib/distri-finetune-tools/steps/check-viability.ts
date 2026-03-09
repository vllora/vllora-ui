/**
 * Task Viability Pre-Check Tool
 *
 * Tests whether the base model can produce meaningful output for the task
 * before committing to the full pipeline. Reuses the grader test pipeline
 * with a viability-focused verdict.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import { runGraderTest } from './test-grader';
import type { CheckViabilityResult, ToolHandler } from '../types';

const DEFAULT_SAMPLE_SIZE = 5;
const MAX_SAMPLE_SIZE = 10;

// Viability thresholds for base model mean scores
const VIABLE_THRESHOLD = 0.10;
const MARGINAL_THRESHOLD = 0.05;

type Verdict = 'viable' | 'marginal' | 'not_viable';

function classifyViability(meanScore: number): Verdict {
  if (meanScore >= VIABLE_THRESHOLD) return 'viable';
  if (meanScore >= MARGINAL_THRESHOLD) return 'marginal';
  return 'not_viable';
}

function getRecommendation(verdict: Verdict, score: number): string {
  const s = score.toFixed(3);
  if (verdict === 'viable') {
    return `Base model produces meaningful output (mean ${s}). Safe to proceed with finetuning.`;
  }
  if (verdict === 'marginal') {
    return `Base model barely produces correct output (mean ${s}). Consider simpler prompts or a stronger base model.`;
  }
  return `Base model completely fails this task (mean ${s}). The task may be too hard. Try easier prompts, a different model, or a simpler grader.`;
}

/** Clamp sample size between 1 and MAX_SAMPLE_SIZE (or record count). */
function clampSampleSize(raw: unknown, recordCount: number): number {
  const size = typeof raw === 'number' ? raw : DEFAULT_SAMPLE_SIZE;
  return Math.min(Math.max(1, size), Math.min(MAX_SAMPLE_SIZE, recordCount));
}

export const checkViabilityHandler: ToolHandler = async (params) => {
  const { workflow_id, sample_size } = params;

  if (!workflow_id || typeof workflow_id !== 'string') {
    return { success: false, error: 'workflow_id is required' } satisfies CheckViabilityResult;
  }

  const workflow = await workflowDB.getWorkflow(workflow_id);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' } satisfies CheckViabilityResult;
  }

  const validSteps = ['grader_config', 'dry_run', 'training'];
  if (!validSteps.includes(workflow.currentStep)) {
    return {
      success: false,
      error: `Viability check requires a configured grader. Current step: ${workflow.currentStep}`,
    } satisfies CheckViabilityResult;
  }

  const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
  if (records.length === 0) {
    return { success: false, error: 'Dataset has no records' } satisfies CheckViabilityResult;
  }

  const sampleCount = clampSampleSize(sample_size, records.length);
  const testResult = await runGraderTest(workflow.datasetId, sampleCount);

  if (!testResult.success || !testResult.test_results) {
    return { success: false, error: testResult.error ?? 'Viability check failed' } satisfies CheckViabilityResult;
  }

  const { average_score, sample_size: actualSize, results, evaluation_run_id } = testResult.test_results;
  const verdict = classifyViability(average_score);

  return {
    success: true,
    viability: {
      verdict,
      mean_score: average_score,
      sample_size: actualSize,
      scored_count: results.length,
      per_record: results.map((r) => ({
        record_id: r.record_id,
        score: r.score,
        reason: r.reason,
      })),
      evaluation_run_id,
      recommendation: getRecommendation(verdict, average_score),
    },
  } satisfies CheckViabilityResult;
};

export const checkViabilityTool: DistriFnTool = {
  name: 'check_viability',
  description:
    'Test whether the base model can produce meaningful output for this task. ' +
    'Runs a mini evaluation on a small sample (default 5 records) and returns a viability verdict. ' +
    'Call this before committing to the full pipeline to catch fundamentally impossible tasks early. ' +
    'Requires a configured grader (takes 1-2 minutes).',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      sample_size: {
        type: 'number',
        default: 5,
        description: 'Number of records to test (1-10, default 5)',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) =>
    JSON.stringify(await checkViabilityHandler(input as Record<string, unknown>)),
} as DistriFnTool;
