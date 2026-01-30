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
      generation_mode = 'rft',
      record_ids, // For Data-First workflow
    } = params;

    // Determine if this is Data-First workflow (seed-based generation)
    const isDataFirstWorkflow = Array.isArray(record_ids) && record_ids.length > 0;

    console.log('[generateSyntheticData] Parsed params:', {
      workflow_id,
      strategy,
      target_topics,
      count_per_topic,
      max_turns,
      generation_mode,
      record_ids,
      isDataFirstWorkflow,
    });

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      console.log('[generateSyntheticData] Workflow not found:', workflow_id);
      return { success: false, error: 'Workflow not found' };
    }

    

    // Step validation: different rules for Data-First vs Topics-First workflow
    if (isDataFirstWorkflow) {
      // Data-First workflow: allow generation from topics_config or coverage_generation step
      const allowedSteps = ['topics_config', 'coverage_generation'];
      if (!allowedSteps.includes(workflow.currentStep)) {
        return {
          success: false,
          error: `Cannot generate data in step ${workflow.currentStep}. For Data-First workflow with record_ids, must be in topics_config or coverage_generation step.`,
        };
      }
    } else {
      // Topics-First workflow: must be in coverage_generation step
      if (workflow.currentStep !== 'coverage_generation') {
        return {
          success: false,
          error: `Cannot generate data in step ${workflow.currentStep}. For Topics-First workflow, must be in coverage_generation step. Use record_ids parameter for Data-First workflow (seed-based generation from topics_config step).`,
        };
      }
    }

    // Get current coverage
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);

    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);

    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    

    // For Data-First workflow, skip coverage analysis if no hierarchy exists
    let balanceScoreBefore = 0;
    let topicsToTarget: string[] = [];

    if (isDataFirstWorkflow) {
      // Data-First workflow: generate from seed records without requiring topics
      balanceScoreBefore = 0; // No meaningful balance score without hierarchy

      // Use target_topics if provided, otherwise leave empty (seed-based mode)
      if (target_topics && Array.isArray(target_topics) && target_topics.length > 0) {
        topicsToTarget = target_topics as string[];
      } else {
        // In seed-based mode, generateTraces will create virtual topics from seed records
      }
    } else {
      // Topics-First workflow: analyze coverage and determine underrepresented topics
      const beforeReport = existingAnalyzeCoverage({records, hierarchy: dataset?.topicHierarchy || undefined});
      balanceScoreBefore = beforeReport.balanceScore;

      // Determine topics to target
      if (target_topics && Array.isArray(target_topics) && target_topics.length > 0) {
        topicsToTarget = target_topics as string[];
      } else {
        // Auto-detect underrepresented topics using coverage analysis
        const targets = calculateGenerationTargets(beforeReport);
        console.log('[generateSyntheticData] Generation targets:', {
          totalRecommendations: targets.recommendations.length,
          recommendations: targets.recommendations.map(r => ({ topic: r.topic, priority: r.priority })),
        });
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
    }

    // Get seed records for generation
    let seedRecordIds: string[];

    if (isDataFirstWorkflow) {
      // Data-First workflow: use provided record_ids directly
      seedRecordIds = record_ids as string[];
    } else {
      // Topics-First workflow: find records matching target topics
      const sampleRecords = records
        .filter(r => r.topic && topicsToTarget.includes(r.topic))
        .slice(0, 10);
      seedRecordIds = sampleRecords.length > 0
        ? sampleRecords.map(r => r.id)
        : records.slice(0, 5).map(r => r.id); // Fallback to any records
    }


    const countPerTopic = typeof count_per_topic === 'number' ? count_per_topic : 10;
    const turns = typeof max_turns === 'number' ? max_turns : 3;

    // Call the actual generation function
    // For Data-First workflow without topics, use seed-based mode
    const generateTracesParams = isDataFirstWorkflow && topicsToTarget.length === 0
      ? {
          // Data-First workflow: seed-based mode
          dataset_id: workflow.datasetId,
          record_ids: seedRecordIds,
          count: countPerTopic,
          max_turns: turns,
          concurrency: 5,
          generation_mode: generation_mode as 'rft' | 'sft',
          // No target_topics or selected_topics - generateTraces will create virtual topics from seeds
        }
      : {
          // Topics-First workflow or Data-First with explicit topics
          dataset_id: workflow.datasetId,
          record_ids: seedRecordIds,
          count: countPerTopic,
          max_turns: turns,
          concurrency: 5,
          target_topics: 'selected' as const,
          selected_topics: topicsToTarget,
          generation_mode: generation_mode as 'rft' | 'sft',
        };
    console.log('[generateSyntheticData] Calling generateTraces with:', JSON.stringify(generateTracesParams, null, 2));

    const generationResult = await generateTraces(generateTracesParams);

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error || 'Generation failed',
      };
    }

    const totalGenerated = generationResult.created_count || 0;

    // Calculate per-topic breakdown (estimated since generateTraces doesn't return per-topic)
    const byTopic: Record<string, { generated: number; valid: number }> = {};
    if (topicsToTarget.length > 0) {
      const perTopicEstimate = Math.ceil(totalGenerated / topicsToTarget.length);
      for (const topic of topicsToTarget) {
        byTopic[topic] = {
          generated: perTopicEstimate,
          valid: perTopicEstimate,
        };
      }
    } else if (isDataFirstWorkflow) {
      // For Data-First workflow without topics, track as "seed_variations"
      byTopic['seed_variations'] = {
        generated: totalGenerated,
        valid: totalGenerated,
      };
    }

    // Recalculate coverage after generation (only meaningful if hierarchy exists)
    let balanceScoreAfter = 0;
    let topicDistribution: Record<string, number> = {};

    if (dataset?.topicHierarchy) {
      console.log('[generateSyntheticData] Recalculating coverage stats for dataset:', workflow.datasetId);
      const afterCoverageStats = await calculateAndSaveCoverageStats(workflow.datasetId);
      balanceScoreAfter = afterCoverageStats.balanceScore;
      topicDistribution = afterCoverageStats.topicDistribution;
      console.log('[generateSyntheticData] Coverage after:', {
        balanceScoreAfter,
        topicDistribution,
      });
    } else {
      console.log('[generateSyntheticData] Data-First workflow: skipping coverage recalculation (no hierarchy)');
    }

    // Record generation in workflow history
    console.log('[generateSyntheticData] Recording generation in workflow history...');
    const topicsForHistory = isDataFirstWorkflow && topicsToTarget.length === 0
      ? ['__seed_based__']
      : topicsToTarget;
    await workflowDB.recordGeneration(workflow_id, {
      strategy: strategy as workflowDB.GenerationStrategy,
      topicsTargeted: topicsForHistory,
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
      topicDistribution,
      recommendations: [],
      generationRounds: [
        ...existingRounds,
        {
          strategy: strategy as workflowDB.GenerationStrategy,
          topicsTargeted: topicsForHistory,
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
        topics_targeted: topicsForHistory,
        records_generated: totalGenerated,
        records_valid: totalGenerated,
        records_rejected: 0,
        by_topic: byTopic,
        balance_score_before: balanceScoreBefore,
        balance_score_after: balanceScoreAfter,
        workflow_mode: isDataFirstWorkflow ? 'data_first' : 'topics_first',
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
  description: `Generate synthetic records to improve coverage or expand from seed records.

**Supports two workflows:**

1. **Data-First Workflow** (seed-based): Provide record_ids to generate variations from existing records.
   - Can be used from topics_config step (before topics are configured)
   - Generates variations of seed records using RFT mode
   - Generated records can be categorized later

2. **Topics-First Workflow** (coverage-based): Generate data for under-represented topics.
   - Must be in coverage_generation step
   - Analyzes topic distribution and targets gaps

**Coverage Indicator Thresholds (Topics-First workflow):**
- Green: >=20% AND >=50 records - Good coverage
- Yellow: >=10% AND >=20 records - Medium coverage
- Orange: >=5% AND >=10 records - Low coverage
- Red: <5% OR <10 records - Critical (insufficient for training)

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
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Seed record IDs to generate variations from. When provided, enables Data-First workflow - can be used from topics_config step without requiring topic hierarchy.',
      },
      strategy: {
        type: 'string',
        enum: ['message_variation', 'few_shot', 'topic_description', 'scenario_expansion', 'tool_chain'],
        default: 'message_variation',
        description: 'Generation strategy to use',
      },
      target_topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Topics to generate data for. If not provided in Topics-First workflow, auto-detects under-represented topics.',
      },
      count_per_topic: {
        type: 'number',
        default: 10,
        description: 'Number of records to generate per topic/seed group (default: 10)',
      },
      max_turns: {
        type: 'number',
        default: 3,
        description: 'Maximum conversation turns per generated record (default: 3, only used in SFT mode)',
      },
      generation_mode: {
        type: 'string',
        enum: ['rft', 'sft'],
        default: 'rft',
        description: 'Generation mode: "rft" (default) generates varied prompts with empty output for reinforcement learning rollouts; "sft" generates complete conversations with assistant responses for supervised fine-tuning',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await generateSyntheticDataHandler(input as Record<string, unknown>)),
} as DistriFnTool;
