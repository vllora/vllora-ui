/**
 * Analyze Knowledge Sources Tool
 *
 * Analyzes dataset objective and uploaded knowledge sources to produce
 * topics, grader criteria, output schema, and strategy recommendations.
 * Lucy uses this output to construct a plan, then calls propose_setup_plan.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { ProposedTopic, GraderCriterion, OutputFormat } from './propose-setup-plan';
import { callLLMForPlan } from './propose-setup-plan';
import { generateGraderTemplate } from './propose-setup-plan';
import { buildKnowledgeContentBlocks } from './shared/knowledge-context';

// =============================================================================
// Types
// =============================================================================

interface AnalyzeKnowledgeSourcesParams {
  dataset_id: string;
}

interface AnalysisResult {
  /** Knowledge sources that were analyzed */
  knowledge_sources: { name: string; topics_extracted: string[] }[];
  /** Proposed topic hierarchy */
  proposed_topics: ProposedTopic[];
  /** Total leaf topic count */
  total_topic_count: number;
  /** Estimated record count based on topic target_counts */
  estimated_records: number;
  /** Grader criteria */
  grader_criteria: GraderCriterion[];
  /** Pre-generated grader template (JS eval script) */
  grader_template_preview: string;
  /** Output format / structured schema (null if free-form) */
  output_format: OutputFormat | null;
  /** Data generation strategy notes */
  strategy: string;
  /** Whether data generation should be grounded in knowledge sources */
  grounded_in_knowledge: boolean;
}

interface AnalyzeKnowledgeSourcesResult {
  success: boolean;
  error?: string;
  analysis?: AnalysisResult;
  /** True if knowledge sources exist but are still processing */
  sources_processing?: boolean;
  message?: string;
}

// =============================================================================
// Handler
// =============================================================================

export const analyzeKnowledgeSourcesHandler: ToolHandler = async (
  params
): Promise<AnalyzeKnowledgeSourcesResult> => {
  try {
    const { dataset_id } = params as unknown as AnalyzeKnowledgeSourcesParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Get dataset
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Get training objective
    const objective = dataset.datasetObjective;
    if (!objective || !objective.trim()) {
      return {
        success: false,
        error: 'Dataset has no training objective. Please set a training objective first.',
        message: 'Before I can analyze knowledge sources, I need to know what you want to train the model to do. Could you describe your training objective?',
      };
    }

    // Build knowledge content blocks (native file blocks + text excerpt fallback)
    const knowledgeCtx = await buildKnowledgeContentBlocks(dataset_id);
    const { textExcerptContext: knowledgeContext, sourcesSummary: knowledgeSourcesSummary, readyCount, processingCount, fileBlocks, hasFileBlocks } = knowledgeCtx;

    // If ANY documents are still processing, wait for ALL to complete
    if (processingCount > 0) {
      const totalSources = readyCount + processingCount;
      let statusMessage: string;
      if (readyCount === 0) {
        statusMessage = `${processingCount} document(s) are still processing.`;
      } else {
        statusMessage = `${readyCount} of ${totalSources} document(s) are ready, ${processingCount} still processing.`;
      }
      return {
        success: true,
        sources_processing: true,
        message: `${statusMessage} Please wait for all documents to finish processing before analyzing.\n\nThis usually takes about 30-60 seconds per document.`,
      };
    }

    console.log('[analyzeKnowledgeSources] Analyzing with', readyCount, 'knowledge sources');

    // Call LLM to analyze (with native file blocks when available)
    if (hasFileBlocks) {
      console.log(`[analyzeKnowledgeSources] Sending ${fileBlocks.length} native file content block(s) to LLM`);
    }
    const llmResult = await callLLMForPlan(objective, knowledgeContext, hasFileBlocks ? fileBlocks : undefined);

    // Count leaf topics
    let totalTopicCount = 0;
    for (const topic of llmResult.proposed_topics) {
      if (topic.subtopics && topic.subtopics.length > 0) {
        totalTopicCount += topic.subtopics.length;
      } else {
        totalTopicCount += 1;
      }
    }

    // Calculate estimated records
    let estimatedRecords = 0;
    for (const topic of llmResult.proposed_topics) {
      estimatedRecords += topic.target_count;
      if (topic.subtopics) {
        for (const sub of topic.subtopics) {
          estimatedRecords += sub.target_count;
        }
      }
    }

    // Parse response schema if present
    let outputFormat: OutputFormat | null = null;
    if (llmResult.output_schema && llmResult.output_schema.trim() !== '') {
      try {
        const parsedSchema = JSON.parse(llmResult.output_schema);
        outputFormat = {
          schema: parsedSchema,
          system_prompt_template: llmResult.system_prompt_template,
        };
      } catch {
        console.warn('[analyzeKnowledgeSources] Failed to parse output_schema, ignoring');
      }
    }

    const analysis: AnalysisResult = {
      knowledge_sources: knowledgeSourcesSummary,
      proposed_topics: llmResult.proposed_topics,
      total_topic_count: totalTopicCount,
      estimated_records: estimatedRecords,
      grader_criteria: llmResult.grader_criteria,
      grader_template_preview: generateGraderTemplate(llmResult.grader_criteria, objective, outputFormat),
      output_format: outputFormat,
      strategy: llmResult.strategy_notes,
      grounded_in_knowledge: readyCount > 0,
    };

    console.log('[analyzeKnowledgeSources] Analysis complete:', {
      topics: totalTopicCount,
      records: estimatedRecords,
      criteria: llmResult.grader_criteria.length,
    });

    return { success: true, analysis };
  } catch (error) {
    console.error('[analyzeKnowledgeSources] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze knowledge sources',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const analyzeKnowledgeSourcesTool: DistriFnTool = {
  name: 'analyze_knowledge_sources',
  description: `Analyze dataset objective and uploaded knowledge sources to produce recommendations.

Returns:
- Proposed topic hierarchy with target counts
- Grader evaluation criteria and template
- Output format / structured schema (if applicable)
- Data generation strategy

Use this tool when you need to understand the dataset's knowledge sources before
constructing a plan. After receiving the analysis, build a plan and call propose_setup_plan.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to analyze',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await analyzeKnowledgeSourcesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
