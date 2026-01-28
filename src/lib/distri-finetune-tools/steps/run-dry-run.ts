/**
 * Run Dry Run Tool
 *
 * Runs a dry run validation on a sample of the dataset before training.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const runDryRunHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, sample_percentage = 10 } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'dry_run') {
      return { success: false, error: `Cannot run dry run in step ${workflow.currentStep}. Must be in dry_run step.` };
    }

    // Get dataset to check evaluation config
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset?.evaluationConfig) {
      return { success: false, error: 'Grader must be configured first. Configure evaluationConfig on the dataset.' };
    }

    // Get records
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const pct = typeof sample_percentage === 'number' ? sample_percentage : 10;
    const sampleSize = Math.max(1, Math.floor(records.length * (pct / 100)));
    const sampleRecords = records.slice(0, sampleSize);

    // TODO: Actually run dry run with grader
    // Mock results
    const results = sampleRecords.map((record) => ({
      record_id: record.id,
      score: Math.random() * 0.4 + 0.6,
      passed: Math.random() > 0.2,
    }));

    const passedCount = results.filter((r) => r.passed).length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const passRate = passedCount / results.length;

    // Determine verdict (GO, NO-GO, WARNING)
    let verdict: workflowDB.DryRunVerdict = 'GO';
    const recommendations: string[] = [];

    if (passRate < 0.5) {
      verdict = 'NO-GO';
      recommendations.push(`Pass rate too low: ${(passRate * 100).toFixed(1)}%`);
    } else if (passRate < 0.7) {
      verdict = 'WARNING';
      recommendations.push(`Pass rate below threshold: ${(passRate * 100).toFixed(1)}%`);
    }

    if (avgScore < 0.6) {
      if (verdict !== 'NO-GO') verdict = 'WARNING';
      recommendations.push(`Average score low: ${avgScore.toFixed(2)}`);
    }

    // Update workflow with proper dryRun structure
    await workflowDB.updateStepData(workflow_id, 'dryRun', {
      mean: avgScore,
      std: 0.1, // TODO: Calculate actual std
      percentAboveZero: passRate * 100,
      percentPerfect: (results.filter(r => r.score >= 0.95).length / results.length) * 100,
      verdict,
      sampleResults: results.map(r => ({
        recordId: r.record_id,
        prompt: '',
        response: '',
        score: r.score,
        reasoning: r.passed ? 'Passed' : 'Failed',
      })),
      recommendations,
    });

    return {
      success: true,
      dry_run: {
        sample_size: sampleSize,
        sample_percentage: pct,
        pass_rate: passRate,
        average_score: avgScore,
        passed_count: passedCount,
        failed_count: sampleSize - passedCount,
        verdict,
        recommendations,
        ready_for_training: verdict === 'GO',
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to run dry run' };
  }
};

export const runDryRunTool: DistriFnTool = {
  name: 'run_dry_run',
  description: 'Run a dry run validation on a sample of the dataset before training.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      sample_percentage: { type: 'number', default: 10, description: 'Percentage of records to test' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await runDryRunHandler(input as Record<string, unknown>)),
} as DistriFnTool;
