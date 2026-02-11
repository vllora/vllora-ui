/**
 * LLM service for generating setup plans
 *
 * Uses the shared Lucy client for direct API calls with support
 * for native file content blocks (PDF, text, images).
 */

import type { ProposedTopic, GraderCriterion } from './types';
import {
  PLAN_GENERATION_SYSTEM,
  PLAN_GENERATION_USER,
  PLAN_RESPONSE_SCHEMA,
} from './prompts';
import { wrapKnowledgeContextForPrompt } from '../shared/knowledge-context';
import {
  callLucy,
  type LucyMessage,
  type ContentBlock,
  type FileContentBlock,
} from '../shared/lucy-client';

// Re-export for backward compatibility (used by adjust-plan.ts and others)
export { fetchLucyConfigCached } from '../shared/lucy-client';

export interface LLMPlanResult {
  proposed_topics: ProposedTopic[];
  grader_criteria: GraderCriterion[];
  strategy_notes: string;
  output_schema: string;
  system_prompt_template: string;
}

export async function callLLMForPlan(
  objective: string,
  knowledgeContext?: string,
  fileContentBlocks?: FileContentBlock[],
): Promise<LLMPlanResult> {
  const knowledgeSection = wrapKnowledgeContextForPrompt(
    knowledgeContext || '',
    !!knowledgeContext
  );

  const userPrompt = PLAN_GENERATION_USER
    .replace('{{objective}}', objective)
    .replace('{{knowledge_section}}', knowledgeSection);

  // Build user message content: file blocks (if any) + text instruction
  let userContent: string | ContentBlock[];
  if (fileContentBlocks && fileContentBlocks.length > 0) {
    userContent = [
      ...fileContentBlocks,
      { type: 'text' as const, text: userPrompt },
    ];
    console.log(`[llm-service] Sending ${fileContentBlocks.length} file content block(s) with plan generation request`);
  } else {
    userContent = userPrompt;
  }

  const messages: LucyMessage[] = [
    { role: 'system', content: PLAN_GENERATION_SYSTEM },
    { role: 'user', content: userContent },
  ];

  const responseText = await callLucy(messages, {
    temperature: 0.7,
    max_tokens: 16000,
    response_format: PLAN_RESPONSE_SCHEMA,
    label: 'propose_setup_plan',
  });

  const parsed = JSON.parse(responseText.trim()) as LLMPlanResult;

  // Validate and fix to ensure exactly 5 leaf topics with 30 records each
  const fixedPlan = validateAndFixInitialPlan(parsed);

  // Validate response schema fields
  return validateOutputFormat(fixedPlan);
}

/**
 * Validate response schema fields. If output_schema is provided but invalid,
 * clear it so the plan falls back to free-form mode.
 */
function validateOutputFormat(result: LLMPlanResult): LLMPlanResult {
  if (!result.output_schema || result.output_schema.trim() === '') {
    // No structured output — clear both fields
    return { ...result, output_schema: '', system_prompt_template: '' };
  }

  try {
    JSON.parse(result.output_schema);
  } catch {
    console.log('[llm-service] output_schema is not valid JSON, clearing');
    return { ...result, output_schema: '', system_prompt_template: '' };
  }

  if (!result.system_prompt_template || result.system_prompt_template.trim() === '') {
    console.log('[llm-service] output_schema present but system_prompt_template missing, clearing');
    return { ...result, output_schema: '', system_prompt_template: '' };
  }

  return result;
}

/**
 * Validate and fix the initial plan to ensure exactly 5 leaf topics.
 * LLMs often ignore exact instructions, so we enforce them here.
 */
function validateAndFixInitialPlan(result: LLMPlanResult): LLMPlanResult {
  const DEFAULT_LEAF_COUNT = 5;
  const DEFAULT_RECORD_COUNT = 30;

  // Count current leaf topics
  const countLeafs = (topics: ProposedTopic[]): number => {
    return topics.reduce((acc, t) => {
      if (t.subtopics && t.subtopics.length > 0) {
        return acc + t.subtopics.length;
      }
      return acc + 1;
    }, 0);
  };

  const currentLeafCount = countLeafs(result.proposed_topics);

  if (currentLeafCount === DEFAULT_LEAF_COUNT) {
    // Correct count, just ensure record counts are right
    return {
      ...result,
      proposed_topics: setRecordCounts(result.proposed_topics, DEFAULT_RECORD_COUNT),
    };
  }

  console.log(`[llm-service] Fixing initial plan: LLM returned ${currentLeafCount} leaf topics, required ${DEFAULT_LEAF_COUNT}`);

  // Collect all leaf topics
  const allLeafs: { name: string; description: string }[] = [];
  for (const t of result.proposed_topics) {
    if (t.subtopics && t.subtopics.length > 0) {
      for (const sub of t.subtopics) {
        allLeafs.push({ name: sub.name, description: sub.description });
      }
    } else {
      allLeafs.push({ name: t.name, description: t.description });
    }
  }

  // Adjust leaf count to exactly 5
  let adjustedLeafs = [...allLeafs];
  if (adjustedLeafs.length > DEFAULT_LEAF_COUNT) {
    adjustedLeafs = adjustedLeafs.slice(0, DEFAULT_LEAF_COUNT);
  } else if (adjustedLeafs.length < DEFAULT_LEAF_COUNT) {
    let counter = adjustedLeafs.length + 1;
    while (adjustedLeafs.length < DEFAULT_LEAF_COUNT) {
      const source = allLeafs[adjustedLeafs.length % Math.max(1, allLeafs.length)];
      adjustedLeafs.push({
        name: source ? `${source.name} ${counter}` : `Topic ${counter}`,
        description: source?.description || 'Training topic',
      });
      counter++;
    }
  }

  // Distribute into 2 parent categories
  const midpoint = Math.ceil(adjustedLeafs.length / 2);
  const category1Leafs = adjustedLeafs.slice(0, midpoint);
  const category2Leafs = adjustedLeafs.slice(midpoint);

  // Use existing category names if available
  const cat1Name = result.proposed_topics[0]?.name || 'Category 1';
  const cat1Desc = result.proposed_topics[0]?.description || 'Training category';
  const cat2Name = result.proposed_topics[1]?.name || 'Category 2';
  const cat2Desc = result.proposed_topics[1]?.description || 'Training category';

  const fixedTopics: ProposedTopic[] = [
    {
      name: cat1Name,
      description: cat1Desc,
      target_count: 0,
      subtopics: category1Leafs.map((l) => ({
        name: l.name,
        description: l.description,
        target_count: DEFAULT_RECORD_COUNT,
      })),
    },
    {
      name: cat2Name,
      description: cat2Desc,
      target_count: 0,
      subtopics: category2Leafs.map((l) => ({
        name: l.name,
        description: l.description,
        target_count: DEFAULT_RECORD_COUNT,
      })),
    },
  ];

  return {
    ...result,
    proposed_topics: fixedTopics,
  };
}

/**
 * Set record count on all leaf topics
 */
function setRecordCounts(topics: ProposedTopic[], recordCount: number): ProposedTopic[] {
  return topics.map((t) => {
    if (t.subtopics && t.subtopics.length > 0) {
      return {
        ...t,
        target_count: 0,
        subtopics: t.subtopics.map((sub) => ({
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
