/**
 * Analyze Coverage Tool
 *
 * Analyzes topic distribution and calculates balance score.
 * Uses the shared calculateAndSaveCoverageStats function for consistency.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, AnalyzeCoverageResult } from '../types';

// Import shared analysis function
import {
  analyzeCoverage as existingAnalyzeCoverage,
  calculateAndSaveCoverageStats,
} from '@/lib/distri-dataset-tools/analysis/analyze-coverage';

export const analyzeCoverageHandler: ToolHandler = async (params): Promise<AnalyzeCoverageResult> => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'coverage_generation') {
      return { success: false, error: `Cannot analyze coverage in step ${workflow.currentStep}. Must be in coverage_generation step.` };
    }

    // Use shared function to calculate and save coverage stats to dataset
    const coverageStats = await calculateAndSaveCoverageStats(workflow.datasetId);

    // Get full coverage report for response (includes distribution details)
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    const coverageReport = existingAnalyzeCoverage({records, hierarchy: dataset?.topicHierarchy || undefined});

    // Convert distribution to expected format for response
    const distribution: Record<string, {
      count: number;
      percentage: number;
      target_percentage: number;
      gap: number;
      status: 'under' | 'ok' | 'over';
    }> = {};

    for (const [topic, dist] of Object.entries(coverageReport.distribution)) {
      distribution[topic] = {
        count: dist.count,
        percentage: dist.percentage,
        target_percentage: dist.targetPercentage,
        gap: dist.gap,
        status: dist.status,
      };
    }

    // Update workflow with process-related data (generation history, synthetic counts)
    await workflowDB.updateStepData(workflow_id, 'coverageGeneration', {
      balanceScore: coverageStats.balanceScore,
      topicDistribution: coverageStats.topicDistribution,
      recommendations: coverageReport.recommendations,
      generationRounds: workflow.coverageGeneration?.generationRounds || [],
      syntheticCount: records.filter((r) => r.is_generated).length,
      syntheticPercentage: records.length > 0
        ? (records.filter((r) => r.is_generated).length / records.length) * 100
        : 0,
    });

    return {
      success: true,
      coverage: {
        balance_score: coverageStats.balanceScore,
        balance_rating: coverageStats.balanceRating,
        distribution,
        recommendations: coverageReport.recommendations,
        uncategorized_count: coverageStats.uncategorizedCount,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to analyze coverage' };
  }
};

export const analyzeCoverageTool: DistriFnTool = {
  name: 'analyze_coverage',
  description: 'Analyze topic distribution and calculate balance score. Must be in coverage_generation step.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await analyzeCoverageHandler(input as Record<string, unknown>)),
} as DistriFnTool;
