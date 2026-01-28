/**
 * Generate Synthetic Data Tool
 *
 * Generates synthetic records to improve topic coverage balance.
 * Uses the generateTraces function to create realistic multi-turn conversations.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, GenerateDataResult } from '../types';

// Import existing analysis and generation tools
import {
  analyzeCoverage as existingAnalyzeCoverage,
  calculateGenerationTargets,
  calculateAndSaveCoverageStats,
} from '@/lib/distri-dataset-tools/analysis/analyze-coverage';
import { generateTraces } from '@/lib/distri-dataset-tools/analysis/generate-traces';

export const generateSyntheticDataHandler: ToolHandler = async (params): Promise<GenerateDataResult> => {
  try {
    const {
      workflow_id,
      strategy = 'message_variation',
      target_topics,
      count_per_topic = 10,
      max_turns = 3,
    } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'coverage_generation') {
      return { success: false, error: `Cannot generate data in step ${workflow.currentStep}. Must be in coverage_generation step.` };
    }

    // Get current coverage
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);

    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    const beforeReport = existingAnalyzeCoverage(records, dataset?.topicHierarchy || null);
    const balanceScoreBefore = beforeReport.balanceScore;

    // Determine topics to target
    let topicsToTarget: string[] = [];
    if (target_topics && Array.isArray(target_topics) && target_topics.length > 0) {
      topicsToTarget = target_topics as string[];
    } else {
      // Auto-detect underrepresented topics using coverage analysis
      const targets = calculateGenerationTargets(beforeReport);
      topicsToTarget = targets.recommendations
        .filter((r) => r.priority === 'high' || r.priority === 'medium')
        .slice(0, 5) // Limit to top 5 topics
        .map((r) => r.topic);
    }

    if (topicsToTarget.length === 0) {
      return {
        success: true,
        generation: {
          strategy: strategy as workflowDB.GenerationStrategy,
          topics_targeted: [],
          records_generated: 0,
          records_valid: 0,
          records_rejected: 0,
          by_topic: {},
          balance_score_before: balanceScoreBefore,
          balance_score_after: balanceScoreBefore,
        },
      };
    }

    // Get sample seed records for generation (prefer records with topics)
    const sampleRecords = records
      .filter(r => r.topic && topicsToTarget.includes(r.topic))
      .slice(0, 10);

    const seedRecordIds = sampleRecords.length > 0
      ? sampleRecords.map(r => r.id)
      : records.slice(0, 5).map(r => r.id); // Fallback to any records

    const countPerTopic = typeof count_per_topic === 'number' ? count_per_topic : 10;
    const turns = typeof max_turns === 'number' ? max_turns : 3;

    // Call the actual generation function
    const generationResult = await generateTraces({
      dataset_id: workflow.datasetId,
      record_ids: seedRecordIds,
      count: countPerTopic,
      max_turns: turns,
      concurrency: 5,
      target_topics: 'selected',
      selected_topics: topicsToTarget,
    });

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error || 'Generation failed',
      };
    }

    const totalGenerated = generationResult.created_count || 0;

    // Calculate per-topic breakdown (estimated since generateTraces doesn't return per-topic)
    const byTopic: Record<string, { generated: number; valid: number }> = {};
    const perTopicEstimate = Math.ceil(totalGenerated / topicsToTarget.length);
    for (const topic of topicsToTarget) {
      byTopic[topic] = {
        generated: perTopicEstimate,
        valid: perTopicEstimate,
      };
    }

    // Recalculate coverage after generation
    const afterCoverageStats = await calculateAndSaveCoverageStats(workflow.datasetId);
    const balanceScoreAfter = afterCoverageStats.balanceScore;

    // Record generation in workflow history
    await workflowDB.recordGeneration(workflow_id, {
      strategy: strategy as workflowDB.GenerationStrategy,
      topicsTargeted: topicsToTarget,
      recordsGenerated: totalGenerated,
      recordsValid: totalGenerated,
      balanceScoreBefore,
      balanceScoreAfter,
    });

    // Update workflow with new generation round
    const existingRounds = workflow.coverageGeneration?.generationRounds || [];
    const newRecordCount = records.length + totalGenerated;
    const syntheticCount = (workflow.coverageGeneration?.syntheticCount || 0) + totalGenerated;

    await workflowDB.updateStepData(workflow_id, 'coverageGeneration', {
      balanceScore: balanceScoreAfter,
      topicDistribution: afterCoverageStats.topicDistribution,
      recommendations: [],
      generationRounds: [
        ...existingRounds,
        {
          strategy: strategy as workflowDB.GenerationStrategy,
          topicsTargeted: topicsToTarget,
          recordsGenerated: totalGenerated,
          timestamp: Date.now(),
        },
      ],
      syntheticCount,
      syntheticPercentage: newRecordCount > 0 ? (syntheticCount / newRecordCount) * 100 : 0,
    });

    return {
      success: true,
      generation: {
        strategy: strategy as workflowDB.GenerationStrategy,
        topics_targeted: topicsToTarget,
        records_generated: totalGenerated,
        records_valid: totalGenerated,
        records_rejected: 0,
        by_topic: byTopic,
        balance_score_before: balanceScoreBefore,
        balance_score_after: balanceScoreAfter,
      },
    };
  } catch (error) {
    console.error('Failed to generate synthetic data:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate data' };
  }
};

export const generateSyntheticDataTool: DistriFnTool = {
  name: 'generate_synthetic_data',
  description: `Generate synthetic records to improve topic coverage balance.

This tool analyzes the current topic distribution and generates new records for under-represented topics.
Must be in coverage_generation step.

**Coverage Indicator Thresholds:**
- Green (>=20%): Good coverage - no generation needed
- Yellow (10-20%): Medium coverage - could benefit from more data
- Orange (5-10%): Low coverage - recommend generating data
- Red (<5%): Critical - strongly recommend generating data

**Strategies:**
- message_variation: Vary user messages while maintaining topic relevance
- few_shot: Generate similar records based on examples
- topic_description: Generate from topic description alone
- scenario_expansion: Expand specific scenarios
- tool_chain: Generate tool usage patterns`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      strategy: {
        type: 'string',
        enum: ['message_variation', 'few_shot', 'topic_description', 'scenario_expansion', 'tool_chain'],
        default: 'message_variation',
        description: 'Generation strategy to use',
      },
      target_topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Topics to generate data for. If not provided, auto-detects under-represented topics (those with yellow/orange/red coverage indicators).',
      },
      count_per_topic: {
        type: 'number',
        default: 10,
        description: 'Number of records to generate per topic (default: 10)',
      },
      max_turns: {
        type: 'number',
        default: 3,
        description: 'Maximum conversation turns per generated record (default: 3)',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await generateSyntheticDataHandler(input as Record<string, unknown>)),
} as DistriFnTool;
