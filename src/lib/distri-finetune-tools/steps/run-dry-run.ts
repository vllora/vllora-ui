/**
 * Run Dry Run Tool
 *
 * Runs a dry run validation on a sample of the dataset before training.
 * Uses the backend evaluation API to run the configured grader on dataset rows.
 * Produces comprehensive diagnostics and saves stats to the dataset.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import {
  createEvaluation,
  waitForEvaluationComplete,
} from '@/services/finetune-api';
import { calculateAndSaveDryRunStats } from '@/lib/distri-dataset-tools/analysis/analyze-dry-run';
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

    // Get dataset to check evaluation config and backend dataset ID
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset?.evaluationConfig) {
      return { success: false, error: 'Grader must be configured first. Configure evaluationConfig on the dataset.' };
    }

    if (!dataset.backendDatasetId) {
      return { success: false, error: 'Dataset must be uploaded to backend first. Upload the dataset before running dry run.' };
    }

    // Get records to calculate sample size and build topic mapping
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const pct = typeof sample_percentage === 'number' ? sample_percentage : 10;
    const sampleSize = Math.max(1, Math.floor(records.length * (pct / 100)));

    // Build recordId -> topic mapping for per-topic analysis
    const recordTopics: Record<string, string> = {};
    for (const record of records) {
      if (record.topic) {
        recordTopics[record.id] = record.topic;
      }
    }

    // Create evaluation run with sampling
    const evaluationResponse = await createEvaluation({
      dataset_id: dataset.backendDatasetId,
      model_params: {
        model: dataset.evaluationConfig.completionParams.model,
        temperature: dataset.evaluationConfig.completionParams.temperature,
      },
      offset: 0,
      limit: sampleSize,
    });

    // Wait for evaluation to complete (poll with timeout)
    const evaluationResult = await waitForEvaluationComplete(
      evaluationResponse.evaluation_run_id,
      60, // max 60 attempts
      2000 // 2 second intervals = 2 minute timeout
    ).catch((pollError) => {
      throw new Error(`Dry run timed out: ${pollError instanceof Error ? pollError.message : 'Unknown error'}`);
    });

    // Run comprehensive analysis and save to dataset
    const dryRunStats = await calculateAndSaveDryRunStats(
      workflow.datasetId,
      evaluationResult,
      pct,
      Object.keys(recordTopics).length > 0 ? recordTopics : undefined
    );

    // Update workflow with summary results (for workflow state tracking)
    await workflowDB.updateStepData(workflow_id, 'dryRun', {
      mean: dryRunStats.statistics.mean,
      std: dryRunStats.statistics.std,
      percentAboveZero: dryRunStats.statistics.percentAboveZero * 100,
      percentPerfect: dryRunStats.statistics.percentPerfect * 100,
      verdict: dryRunStats.diagnosis.verdict,
      sampleResults: dryRunStats.sampleResults.lowest.concat(dryRunStats.sampleResults.highest).slice(0, 10).map((r) => ({
        recordId: r.recordId,
        prompt: '',
        response: '',
        score: r.score,
        reasoning: r.reason || '',
      })),
      recommendations: dryRunStats.diagnosis.recommendations,
    });

    return {
      success: true,
      dry_run: {
        evaluation_run_id: dryRunStats.evaluationRunId,
        sample_size: dryRunStats.samplesEvaluated,
        sample_percentage: pct,
        // Core statistics
        mean: dryRunStats.statistics.mean,
        std: dryRunStats.statistics.std,
        median: dryRunStats.statistics.median,
        min: dryRunStats.statistics.min,
        max: dryRunStats.statistics.max,
        // Percentiles
        percentiles: dryRunStats.statistics.percentiles,
        // Score fractions
        percent_above_zero: dryRunStats.statistics.percentAboveZero,
        percent_perfect: dryRunStats.statistics.percentPerfect,
        // Score distribution
        distribution: dryRunStats.distribution,
        // Diagnosis
        verdict: dryRunStats.diagnosis.verdict,
        dataset_quality: dryRunStats.diagnosis.datasetQuality,
        grader_quality: dryRunStats.diagnosis.graderQuality,
        warnings: dryRunStats.diagnosis.warnings,
        recommendations: dryRunStats.diagnosis.recommendations,
        issues: dryRunStats.diagnosis.issues,
        // Per-topic breakdown
        by_topic: dryRunStats.byTopic,
        // Ready flag
        ready_for_training: dryRunStats.diagnosis.verdict === 'GO',
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to run dry run' };
  }
};

export const runDryRunTool: DistriFnTool = {
  name: 'run_dry_run',
  description: 'Run a dry run validation on a sample of the dataset before training. Requires dataset to be uploaded to backend first.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      sample_percentage: { type: 'number', default: 10, description: 'Percentage of records to test (1-100)' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await runDryRunHandler(input as Record<string, unknown>)),
} as DistriFnTool;
