/**
 * Propose Setup Plan Handler
 *
 * Main handler logic for generating setup plans.
 */

import * as datasetsDB from '@/services/datasets-db';
import * as knowledgeDB from '@/services/knowledge-sources-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../../types';
import type {
  ProposeSetupPlanParams,
  SetupPlan,
  ProposeSetupPlanResult,
} from './types';
import { callLLMForPlan } from './llm-service';
import { generateGraderTemplate } from './grader-template';

export const proposeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ProposeSetupPlanResult> => {
  try {
    console.log('[proposeSetupPlan] Starting with params:', JSON.stringify(params, null, 2));

    const { dataset_id, seed_count = 30 } = params as unknown as ProposeSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Emit event so right panel shows loading state
    emitter.emit('vllora_setup_plan_generating', { datasetId: dataset_id });

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
        message: 'Before I can create a setup plan, I need to know what you want to train the model to do. Could you describe your training objective?',
      };
    }

    // Get knowledge sources
    const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
    const readySources = sources.filter((s) => s.status === 'ready');
    const processingSources = sources.filter((s) => s.status === 'processing');

    // Build knowledge context
    let knowledgeContext: string | undefined;
    const knowledgeSourcesSummary: { name: string; topics_extracted: string[] }[] = [];

    if (readySources.length > 0) {
      const contextParts: string[] = [];
      for (const source of readySources) {
        const topics = source.extractedContent?.topics || [];
        knowledgeSourcesSummary.push({
          name: source.name,
          topics_extracted: topics,
        });

        if (source.extractedContent?.text) {
          contextParts.push(
            `[${source.name}]:\nTopics: ${topics.join(', ')}\nContent: ${source.extractedContent.text.substring(0, 1500)}...`
          );
        }
      }
      if (contextParts.length > 0) {
        knowledgeContext = contextParts.join('\n\n---\n\n');
      }
    }

    // If no ready sources but some are still processing, ask user to wait
    if (readySources.length === 0 && processingSources.length > 0) {
      const processingNames = processingSources.map((s) => s.name).join(', ');
      return {
        success: true,
        requires_knowledge_sources: true,
        sources_processing: true,
        message: `Your documents are still being processed: ${processingNames}\n\nPlease wait a moment for processing to complete, then try again. This usually takes about 30-60 seconds per document.`,
        plan: undefined,
      };
    }

    // If no knowledge sources at all, suggest uploading
    if (readySources.length === 0) {
      return {
        success: true,
        requires_knowledge_sources: true,
        message: `I can see you want to train a model for: "${objective}"\n\nTo create the best setup plan, I recommend uploading some reference documents (PDFs, text files) that contain the knowledge you want the model to learn from.\n\nYou can drag & drop files here, or click the attachment button.\n\nAlternatively, I can create a general plan without specific knowledge sources - just let me know!`,
        plan: undefined,
      };
    }

    console.log('[proposeSetupPlan] Generating plan with', readySources.length, 'knowledge sources');

    // Call LLM to generate plan
    const llmResult = await callLLMForPlan(objective, seed_count, knowledgeContext);

    // Count total topics
    let totalTopicCount = llmResult.proposed_topics.length;
    for (const topic of llmResult.proposed_topics) {
      if (topic.subtopics) {
        totalTopicCount += topic.subtopics.length;
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

    // Build the complete plan
    const plan: SetupPlan = {
      dataset_id,
      dataset_name: dataset.name,
      objective,
      knowledge_sources: knowledgeSourcesSummary,
      proposed_topics: llmResult.proposed_topics,
      total_topic_count: totalTopicCount,
      data_generation: {
        seed_count: Math.min(seed_count, estimatedRecords),
        strategy: llmResult.strategy_notes,
        grounded_in_knowledge: readySources.length > 0,
      },
      grader_config: {
        criteria: llmResult.grader_criteria,
        passing_threshold: 0.7,
        template_preview: generateGraderTemplate(llmResult.grader_criteria, objective),
      },
      execution_steps: [
        {
          step: 'Apply Topic Hierarchy',
          description: `Configure ${totalTopicCount} topics for organizing training data`,
          estimated_time: '~5 seconds',
        },
        {
          step: 'Generate Initial Data',
          description: `Generate ${estimatedRecords} training examples distributed across topics`,
          estimated_time: estimatedRecords > 100 ? '~3-5 minutes' : '~1-2 minutes',
        },
        {
          step: 'Configure Evaluator',
          description: 'Set up the grading criteria for evaluating model responses',
          estimated_time: '~5 seconds',
        },
        {
          step: 'Run Dry Run',
          description: 'Test the training data with the current model to establish baseline',
          estimated_time: '~1-2 minutes',
        },
        {
          step: 'Setup Fine-tune Job',
          description: 'Prepare the fine-tuning job (you can start it when ready)',
          estimated_time: '~10 seconds',
        },
      ],
      estimated_records: estimatedRecords,
      estimated_duration: '3-5 minutes',
    };

    console.log('[proposeSetupPlan] Plan generated successfully');

    // Emit event so the right panel can display the plan card
    emitter.emit('vllora_setup_plan_proposed', { datasetId: dataset_id, plan });

    return {
      success: true,
      plan,
    };
  } catch (error) {
    console.error('[proposeSetupPlan] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate setup plan',
    };
  }
};
