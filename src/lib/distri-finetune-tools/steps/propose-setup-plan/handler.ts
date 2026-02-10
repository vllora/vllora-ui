/**
 * Propose Setup Plan Handler
 *
 * Main handler logic for generating setup plans.
 */

import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../../types';
import type {
  ProposeSetupPlanParams,
  SetupPlan,
  ProposeSetupPlanResult,
} from './types';
import { callLLMForPlan } from './llm-service';
import { generateGraderTemplate } from './grader-template';
import { saveProposedPlan } from '../proposed-plan-store';
import { buildKnowledgeContext } from '../shared/knowledge-context';

export const proposeSetupPlanHandler: ToolHandler = async (
  params
): Promise<ProposeSetupPlanResult> => {
  try {
    console.log('[proposeSetupPlan] Starting with params:', JSON.stringify(params, null, 2));

    const { dataset_id } = params as unknown as ProposeSetupPlanParams;

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

    // Build knowledge context using shared module
    const knowledgeCtx = await buildKnowledgeContext(dataset_id);
    const { contextString: knowledgeContext, sourcesSummary: knowledgeSourcesSummary, readyCount, processingCount } = knowledgeCtx;

    // If ANY documents are still processing, wait for ALL to complete
    // This ensures the plan is generated with full knowledge context
    if (processingCount > 0) {
      const totalSources = readyCount + processingCount;
      return {
        success: true,
        requires_knowledge_sources: true,
        sources_processing: true,
        message: `${readyCount} of ${totalSources} document(s) are ready. Please wait for all documents to finish processing before generating the plan.\n\nThis usually takes about 30-60 seconds per document.`,
        plan: undefined,
      };
    }

    // Proceed with or without knowledge sources
    console.log('[proposeSetupPlan] Generating plan with', readyCount, 'knowledge sources');

    // Call LLM to generate plan
    const llmResult = await callLLMForPlan(objective, knowledgeContext);

    // Count leaf topics only (topics that will have records assigned)
    // If a topic has subtopics, count only the subtopics (not the parent)
    // If a topic has no subtopics, count it as a leaf
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

    // Build the complete plan
    const plan: SetupPlan = {
      dataset_id,
      dataset_name: dataset.name,
      objective,
      knowledge_sources: knowledgeSourcesSummary,
      proposed_topics: llmResult.proposed_topics,
      total_topic_count: totalTopicCount,
      data_generation: {
        strategy: llmResult.strategy_notes,
        grounded_in_knowledge: readyCount > 0,
      },
      grader_config: {
        criteria: llmResult.grader_criteria,
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
          estimated_time: estimatedRecords > 100 ? '~10-15 minutes' : '~1-2 minutes',
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

    // Persist plan to IndexedDB so it survives page refresh
    await saveProposedPlan(dataset_id, plan);

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
