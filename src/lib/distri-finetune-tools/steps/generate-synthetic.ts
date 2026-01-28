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
    console.log('[generateSyntheticData] Starting with params:', JSON.stringify(params, null, 2));

    const {
      workflow_id,
      strategy = 'message_variation',
      target_topics,
      count_per_topic = 10,
      max_turns = 3,
    } = params;

    console.log('[generateSyntheticData] Parsed params:', {
      workflow_id,
      strategy,
      target_topics,
      count_per_topic,
      max_turns,
    });

    if (!workflow_id || typeof workflow_id !== 'string') {
      console.log('[generateSyntheticData] Invalid workflow_id:', workflow_id);
      return { success: false, error: 'workflow_id is required' };
    }

    console.log('[generateSyntheticData] Fetching workflow:', workflow_id);
    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      console.log('[generateSyntheticData] Workflow not found:', workflow_id);
      return { success: false, error: 'Workflow not found' };
    }

    console.log('[generateSyntheticData] Workflow found:', {
      id: workflow.id,
      currentStep: workflow.currentStep,
      datasetId: workflow.datasetId,
    });

    if (workflow.currentStep !== 'coverage_generation') {
      console.log('[generateSyntheticData] Wrong step:', workflow.currentStep);
      return { success: false, error: `Cannot generate data in step ${workflow.currentStep}. Must be in coverage_generation step.` };
    }

    // Get current coverage
    console.log('[generateSyntheticData] Fetching records for dataset:', workflow.datasetId);
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    console.log('[generateSyntheticData] Records fetched:', records.length);

    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);

    if (!dataset) {
      console.log('[generateSyntheticData] Dataset not found:', workflow.datasetId);
      return { success: false, error: 'Dataset not found' };
    }

    console.log('[generateSyntheticData] Dataset found:', {
      id: dataset.id,
      name: dataset.name,
      hasTopicHierarchy: !!dataset.topicHierarchy,
    });

    console.log('[generateSyntheticData] Analyzing coverage before generation...');
    const beforeReport = existingAnalyzeCoverage(records, dataset?.topicHierarchy || null);
    const balanceScoreBefore = beforeReport.balanceScore;
    console.log('[generateSyntheticData] Coverage before:', {
      balanceScoreBefore,
      distribution: beforeReport.distribution,
    });

    // Determine topics to target
    console.log('[generateSyntheticData] Determining topics to target...');
    let topicsToTarget: string[] = [];
    if (target_topics && Array.isArray(target_topics) && target_topics.length > 0) {
      topicsToTarget = target_topics as string[];
      console.log('[generateSyntheticData] Using provided target_topics:', topicsToTarget);
    } else {
      // Auto-detect underrepresented topics using coverage analysis
      console.log('[generateSyntheticData] Auto-detecting underrepresented topics...');
      const targets = calculateGenerationTargets(beforeReport);
      console.log('[generateSyntheticData] Generation targets:', {
        totalRecommendations: targets.recommendations.length,
        recommendations: targets.recommendations.map(r => ({ topic: r.topic, priority: r.priority })),
      });
      topicsToTarget = targets.recommendations
        .filter((r) => r.priority === 'high' || r.priority === 'medium')
        .slice(0, 5) // Limit to top 5 topics
        .map((r) => r.topic);
      console.log('[generateSyntheticData] Selected topics (high/medium priority):', topicsToTarget);
    }

    if (topicsToTarget.length === 0) {
      console.log('[generateSyntheticData] No topics to target, returning early');
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
    console.log('[generateSyntheticData] Finding seed records for topics:', topicsToTarget);
    const sampleRecords = records
      .filter(r => r.topic && topicsToTarget.includes(r.topic))
      .slice(0, 10);

    console.log('[generateSyntheticData] Sample records with matching topics:', sampleRecords.length);

    const seedRecordIds = sampleRecords.length > 0
      ? sampleRecords.map(r => r.id)
      : records.slice(0, 5).map(r => r.id); // Fallback to any records

    console.log('[generateSyntheticData] Seed record IDs:', seedRecordIds);

    const countPerTopic = typeof count_per_topic === 'number' ? count_per_topic : 10;
    const turns = typeof max_turns === 'number' ? max_turns : 3;

    // Call the actual generation function
    const generateTracesParams = {
      dataset_id: workflow.datasetId,
      record_ids: seedRecordIds,
      count: countPerTopic,
      max_turns: turns,
      concurrency: 5,
      target_topics: 'selected' as const,
      selected_topics: topicsToTarget,
    };
    console.log('[generateSyntheticData] Calling generateTraces with:', JSON.stringify(generateTracesParams, null, 2));

    const generationResult = await generateTraces(generateTracesParams);

    console.log('[generateSyntheticData] generateTraces result:', {
      success: generationResult.success,
      created_count: generationResult.created_count,
      error: generationResult.error,
    });

    if (!generationResult.success) {
      console.log('[generateSyntheticData] Generation failed:', generationResult.error);
      return {
        success: false,
        error: generationResult.error || 'Generation failed',
      };
    }

    const totalGenerated = generationResult.created_count || 0;
    console.log('[generateSyntheticData] Total generated:', totalGenerated);

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
    console.log('[generateSyntheticData] Recalculating coverage stats for dataset:', workflow.datasetId);
    const afterCoverageStats = await calculateAndSaveCoverageStats(workflow.datasetId);
    const balanceScoreAfter = afterCoverageStats.balanceScore;
    console.log('[generateSyntheticData] Coverage after:', {
      balanceScoreAfter,
      topicDistribution: afterCoverageStats.topicDistribution,
    });

    // Record generation in workflow history
    console.log('[generateSyntheticData] Recording generation in workflow history...');
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

    console.log('[generateSyntheticData] Updating workflow step data:', {
      existingRoundsCount: existingRounds.length,
      newRecordCount,
      syntheticCount,
      syntheticPercentage: newRecordCount > 0 ? (syntheticCount / newRecordCount) * 100 : 0,
    });

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

    console.log('[generateSyntheticData] Successfully completed generation');
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
    console.error('[generateSyntheticData] Failed to generate synthetic data:', error);
    if (error instanceof Error) {
      console.error('[generateSyntheticData] Error stack:', error.stack);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate data' };
  }
};

export const generateSyntheticDataTool: DistriFnTool = {
  name: 'generate_synthetic_data',
  description: `Generate synthetic records to improve topic coverage balance.

This tool analyzes the current topic distribution and generates new records for under-represented topics.
Must be in coverage_generation step.

**Coverage Indicator Thresholds (must meet BOTH percentage AND count):**
- Green: >=20% AND >=50 records - Good coverage
- Yellow: >=10% AND >=20 records - Medium coverage
- Orange: >=5% AND >=10 records - Low coverage
- Red: <5% OR <10 records - Critical (insufficient for training)

NOTE: A topic with 100% but only 1 record is RED (critical), not green!

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
