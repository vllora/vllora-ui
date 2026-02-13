/**
 * Adjust Setup Plan Tool
 *
 * Modifies an existing setup plan based on user feedback.
 * Allows users to request changes via chat instead of manual editing.
 */

import type { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../../types';
import type { SetupPlan, ProposedTopic, GraderCriterion } from './types';
import { callLucy, type LucyMessage } from '../shared/lucy-client';
import { generateGraderTemplate } from './grader-template';
import { saveProposedPlan } from '../proposed-plan-store';

interface AdjustSetupPlanParams {
  dataset_id: string;
  current_plan: SetupPlan;
  user_feedback: string;
}

interface AdjustSetupPlanResult {
  success: boolean;
  error?: string;
  plan?: SetupPlan;
  message?: string;
}

// Schema for the adjusted plan
const ADJUST_PLAN_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'adjusted_plan',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        proposed_topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              target_count: { type: 'number' },
              subtopics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    target_count: { type: 'number' },
                  },
                  required: ['name', 'description', 'target_count'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'description', 'target_count', 'subtopics'],
            additionalProperties: false,
          },
        },
        grader_criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              weight: { type: 'number' },
            },
            required: ['name', 'description', 'weight'],
            additionalProperties: false,
          },
        },
        changes_made: { type: 'string' },
      },
      required: ['proposed_topics', 'grader_criteria', 'changes_made'],
      additionalProperties: false,
    },
  },
};

const ADJUST_PLAN_SYSTEM = `You adjust fine-tuning setup plans based on user requests.

## ABSOLUTE RULES - VIOLATION IS FAILURE

1. **EXACT LEAF TOPIC COUNT**: When user says "X topics", output EXACTLY X leaf topics.
   - Leaf topics = topics where records are assigned (the children/subtopics)
   - "5 topics" = exactly 5 leaf topics total

2. **DEFAULT 2-LEVEL HIERARCHY**: Unless user says "flat", organize topics in 2 levels:
   - Parent categories (2-4 categories) with target_count: 0
   - Leaf subtopics under parents with the actual target_count
   - Total leaf count must match user's requested topic count

3. **EXACT RECORD COUNT**: When user says "Y records each", set target_count: Y on EVERY leaf topic.
   - "55 records each" = target_count: 55 on all leaf topics
   - Parent topics ALWAYS get target_count: 0
   - No variation, no rounding, EXACTLY the number specified

4. **FLAT ONLY IF REQUESTED**: Only use flat structure (subtopics: []) if user explicitly says "flat"

5. **SHORT NAMES**: Topic names 2-4 words max. Details go in description.

Example 1: "5 topics with 55 records each" (default = 2-level)
→ 2-3 parent categories (target_count: 0) with subtopics totaling 5 leaves (target_count: 55 each)

Example 2: "5 flat topics with 55 records each"
→ 5 topics with subtopics: [] and target_count: 55 each`;

async function callLLMToAdjustPlan(
  currentPlan: SetupPlan,
  userFeedback: string
): Promise<{
  proposed_topics: ProposedTopic[];
  grader_criteria: GraderCriterion[];
  changes_made: string;
}> {
  // Format current criteria for context (topics are regenerated from scratch based on user feedback)
  const currentCriteriaJson = JSON.stringify(currentPlan.grader_config.criteria, null, 2);

  // Parse user feedback to extract numbers and structure preferences
  const topicCountMatch = userFeedback.match(/(\d+)\s*(?:leaf\s*)?topics?/i);
  const recordCountMatch = userFeedback.match(/(\d+)\s*(?:records?|examples?)\s*(?:each|per)?/i);
  const categoryCountMatch = userFeedback.match(/(\d+)\s*(?:categor(?:y|ies)|parent|group)/i);
  const wantsFlat = /\bflat\b/i.test(userFeedback);

  const extractedTopicCount = topicCountMatch ? parseInt(topicCountMatch[1], 10) : null;
  const extractedRecordCount = recordCountMatch ? parseInt(recordCountMatch[1], 10) : null;
  const extractedCategoryCount = categoryCountMatch ? parseInt(categoryCountMatch[1], 10) : null;

  let structureNote = '';
  if (wantsFlat) {
    structureNote = `- STRUCTURE: FLAT (user requested flat - all topics have subtopics: [])`;
  } else if (extractedCategoryCount) {
    structureNote = `- STRUCTURE: 2-LEVEL with exactly ${extractedCategoryCount} parent categories
- Parent topics: target_count = 0
- Leaf subtopics: target_count = ${extractedRecordCount || 'as specified'} each
- Total leaf count: ${extractedTopicCount || 'as requested'}`;
  } else {
    // Default: 2-level hierarchy with auto-determined category count
    structureNote = `- STRUCTURE: 2-LEVEL HIERARCHY (default)
- Create 2-4 parent categories (target_count = 0)
- Distribute ${extractedTopicCount || 'requested'} leaf subtopics across parents
- Leaf subtopics: target_count = ${extractedRecordCount || 'as specified'} each`;
  }

  const numbersEmphasis = extractedTopicCount || extractedRecordCount
    ? `\n\n## EXTRACTED REQUIREMENTS (MUST FOLLOW EXACTLY)
${extractedTopicCount ? `- LEAF TOPIC COUNT: exactly ${extractedTopicCount} leaf topics (where records are assigned)` : ''}
${extractedRecordCount ? `- RECORDS PER LEAF: exactly ${extractedRecordCount} (target_count = ${extractedRecordCount} on each leaf)` : ''}
${structureNote}`
    : '';

  const userPrompt = `Training Objective: ${currentPlan.objective}

User Request: "${userFeedback}"
${numbersEmphasis}

Current grader criteria (keep unless user asks to change):
${currentCriteriaJson}

Generate exactly what the user asked for. Output JSON with:
- proposed_topics: array of parent categories with subtopics (2-level hierarchy by default)
- grader_criteria: keep existing criteria
- changes_made: brief description

Remember: "X topics" means X LEAF topics. Default is 2-level hierarchy with parent categories (target_count=0) and leaf subtopics.`;

  const messages: LucyMessage[] = [
    { role: 'system', content: ADJUST_PLAN_SYSTEM },
    { role: 'user', content: userPrompt },
  ];

  const responseText = await callLucy(messages, {
    temperature: 0, // Force deterministic output for exact number following
    response_format: ADJUST_PLAN_RESPONSE_SCHEMA,
    label: 'adjust_setup_plan',
  });

  const parsed = JSON.parse(responseText.trim());

  // Validate and fix the response if user specified exact numbers
  const validated = validateAndFixResponse(
    parsed,
    extractedTopicCount,
    extractedRecordCount,
    wantsFlat
  );

  return validated;
}

/**
 * Validate LLM response and fix if it doesn't match requirements.
 * LLMs often ignore exact number instructions, so we enforce them here.
 */
function validateAndFixResponse(
  response: {
    proposed_topics: ProposedTopic[];
    grader_criteria: GraderCriterion[];
    changes_made: string;
  },
  requiredTopicCount: number | null,
  requiredRecordCount: number | null,
  wantsFlat: boolean
): typeof response {
  if (!requiredTopicCount && !requiredRecordCount) {
    return response; // No specific requirements to enforce
  }

  let topics = response.proposed_topics;

  // Count current leaf topics
  const countLeafs = (t: ProposedTopic[]): number => {
    return t.reduce((acc, topic) => {
      if (topic.subtopics && topic.subtopics.length > 0) {
        return acc + topic.subtopics.length;
      }
      return acc + 1;
    }, 0);
  };

  // If flat is requested, flatten the structure
  if (wantsFlat && topics.some(t => t.subtopics && t.subtopics.length > 0)) {
    // Flatten: convert all subtopics to top-level topics
    const flatTopics: ProposedTopic[] = [];
    for (const topic of topics) {
      if (topic.subtopics && topic.subtopics.length > 0) {
        for (const sub of topic.subtopics) {
          flatTopics.push({
            name: sub.name,
            description: sub.description,
            target_count: sub.target_count,
            subtopics: [],
          });
        }
      } else {
        flatTopics.push({ ...topic, subtopics: [] });
      }
    }
    topics = flatTopics;
  }

  // Fix topic count if required
  if (requiredTopicCount !== null) {
    const leafCount = countLeafs(topics);

    if (leafCount !== requiredTopicCount) {
      console.log(`[adjustSetupPlan] Fixing topic count: LLM returned ${leafCount}, required ${requiredTopicCount}`);

      if (wantsFlat) {
        // For flat structure, adjust number of top-level topics
        topics = adjustFlatTopicCount(topics, requiredTopicCount, requiredRecordCount || 50);
      } else {
        // For hierarchical structure, adjust subtopics
        topics = adjustHierarchicalTopicCount(topics, requiredTopicCount, requiredRecordCount || 50);
      }
    }
  }

  // Fix record count on all leaf topics if required
  if (requiredRecordCount !== null) {
    topics = setRecordCountOnLeafs(topics, requiredRecordCount);
  }

  return {
    ...response,
    proposed_topics: topics,
    changes_made: response.changes_made + (requiredTopicCount || requiredRecordCount ? ' (counts adjusted to match request)' : ''),
  };
}

/**
 * Adjust flat topic count to match required count
 */
function adjustFlatTopicCount(
  topics: ProposedTopic[],
  requiredCount: number,
  recordCount: number
): ProposedTopic[] {
  // Collect all existing topics (flatten if needed)
  const allTopics: ProposedTopic[] = [];
  for (const t of topics) {
    if (t.subtopics && t.subtopics.length > 0) {
      for (const sub of t.subtopics) {
        allTopics.push({
          name: sub.name,
          description: sub.description,
          target_count: recordCount,
          subtopics: [],
        });
      }
    } else {
      allTopics.push({ ...t, target_count: recordCount, subtopics: [] });
    }
  }

  if (allTopics.length >= requiredCount) {
    // Trim to required count
    return allTopics.slice(0, requiredCount);
  } else {
    // Need more topics - duplicate and rename
    const result = [...allTopics];
    let counter = allTopics.length + 1;
    while (result.length < requiredCount) {
      const source = allTopics[result.length % allTopics.length];
      result.push({
        name: `${source.name} ${counter}`,
        description: source.description,
        target_count: recordCount,
        subtopics: [],
      });
      counter++;
    }
    return result;
  }
}

/**
 * Adjust hierarchical topic count to match required leaf count
 */
function adjustHierarchicalTopicCount(
  topics: ProposedTopic[],
  requiredLeafCount: number,
  recordCount: number
): ProposedTopic[] {
  // Collect all leaf topics
  const allLeafs: { name: string; description: string }[] = [];
  for (const t of topics) {
    if (t.subtopics && t.subtopics.length > 0) {
      for (const sub of t.subtopics) {
        allLeafs.push({ name: sub.name, description: sub.description });
      }
    } else {
      allLeafs.push({ name: t.name, description: t.description });
    }
  }

  // Adjust leaf count
  let adjustedLeafs = [...allLeafs];
  if (adjustedLeafs.length > requiredLeafCount) {
    adjustedLeafs = adjustedLeafs.slice(0, requiredLeafCount);
  } else if (adjustedLeafs.length < requiredLeafCount) {
    let counter = adjustedLeafs.length + 1;
    while (adjustedLeafs.length < requiredLeafCount) {
      const source = allLeafs[adjustedLeafs.length % allLeafs.length];
      adjustedLeafs.push({
        name: `${source.name} ${counter}`,
        description: source.description,
      });
      counter++;
    }
  }

  // Distribute into 2-3 parent categories
  const numCategories = Math.min(3, Math.max(2, Math.ceil(requiredLeafCount / 3)));
  const categories: ProposedTopic[] = [];

  // Use existing category names if available
  const categoryNames = topics.slice(0, numCategories).map(t => ({
    name: t.name,
    description: t.description,
  }));

  // Fill in missing category names
  while (categoryNames.length < numCategories) {
    categoryNames.push({
      name: `Category ${categoryNames.length + 1}`,
      description: 'Training category',
    });
  }

  // Distribute leafs across categories
  for (let i = 0; i < numCategories; i++) {
    const startIdx = Math.floor(i * adjustedLeafs.length / numCategories);
    const endIdx = Math.floor((i + 1) * adjustedLeafs.length / numCategories);
    const categoryLeafs = adjustedLeafs.slice(startIdx, endIdx);

    categories.push({
      name: categoryNames[i].name,
      description: categoryNames[i].description,
      target_count: 0, // Parent has 0
      subtopics: categoryLeafs.map(l => ({
        name: l.name,
        description: l.description,
        target_count: recordCount,
      })),
    });
  }

  return categories;
}

/**
 * Set record count on all leaf topics
 */
function setRecordCountOnLeafs(topics: ProposedTopic[], recordCount: number): ProposedTopic[] {
  return topics.map(t => {
    if (t.subtopics && t.subtopics.length > 0) {
      return {
        ...t,
        target_count: 0, // Parent always 0
        subtopics: t.subtopics.map(sub => ({
          ...sub,
          target_count: recordCount,
        })),
      };
    } else {
      return {
        ...t,
        target_count: recordCount,
      };
    }
  });
}

export const adjustSetupPlanHandler: ToolHandler = async (
  params
): Promise<AdjustSetupPlanResult> => {
  try {
    console.log('[adjustSetupPlan] Starting with feedback:', params);

    const { dataset_id, current_plan, user_feedback } = params as unknown as AdjustSetupPlanParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    if (!current_plan) {
      return { success: false, error: 'current_plan is required' };
    }

    if (!user_feedback || !user_feedback.trim()) {
      return { success: false, error: 'user_feedback is required' };
    }

    // Emit event to show loading state
    emitter.emit('vllora_setup_plan_generating', { datasetId: dataset_id });

    console.log('[adjustSetupPlan] Calling LLM to adjust plan...');

    // Call LLM to adjust the plan
    const llmResult = await callLLMToAdjustPlan(current_plan, user_feedback);

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

    // Build the adjusted plan
    const adjustedPlan: SetupPlan = {
      ...current_plan,
      proposed_topics: llmResult.proposed_topics,
      total_topic_count: totalTopicCount,
      grader_config: {
        criteria: llmResult.grader_criteria,
        template_preview: generateGraderTemplate(llmResult.grader_criteria, current_plan.objective),
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

    console.log('[adjustSetupPlan] Plan adjusted successfully:', llmResult.changes_made);

    // Persist adjusted plan to IndexedDB so it survives page refresh
    await saveProposedPlan(dataset_id, adjustedPlan);

    // Emit event so the right panel can display the updated plan
    emitter.emit('vllora_setup_plan_proposed', { datasetId: dataset_id, plan: adjustedPlan });

    return {
      success: true,
      plan: adjustedPlan,
      message: `Plan adjusted: ${llmResult.changes_made}`,
    };
  } catch (error) {
    console.error('[adjustSetupPlan] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to adjust setup plan',
    };
  }
};

export const adjustSetupPlanTool: DistriFnTool = {
  name: 'adjust_setup_plan',
  description: `Adjust an existing setup plan based on user feedback.

Use this tool when:
- A setup plan has already been proposed
- The user requests changes to the plan (e.g., "reduce to 5 topics", "increase examples to 100 each")
- The user wants to modify topic structure, counts, or criteria

This tool takes the current plan and user feedback, then regenerates an adjusted plan.
The adjusted plan is shown to the user for approval.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      current_plan: {
        type: 'object',
        description: 'The current setup plan to adjust',
      },
      user_feedback: {
        type: 'string',
        description: 'The user\'s feedback/request for changes (e.g., "reduce to 5 topics with 50 records each")',
      },
    },
    required: ['dataset_id', 'current_plan', 'user_feedback'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await adjustSetupPlanHandler(input as Record<string, unknown>)),
} as DistriFnTool;
