/**
 * Apply Topic Hierarchy Tool
 *
 * Applies a user-provided or edited topic hierarchy to the workflow.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService } from '@/services/service-registry';
import type { TopicHierarchyNode } from '@/types/dataset-types';
import type { ToolHandler } from '../types';
import { countLeafTopics, calculateMaxDepth } from './helpers';
import { normalizeTopicSegments, normalizeObjectiveToRole } from './shared';
import { getProposedPlan } from './proposed-plan-store';

/**
 * Normalize and validate hierarchy nodes.
 * - Ensures each node has a unique `id`
 * - Ensures each node has a `name`
 * - Recursively processes children
 */
function normalizeHierarchy(
  nodes: unknown[],
  parentPath: string = ''
): TopicHierarchyNode[] {
  const result: TopicHierarchyNode[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Record<string, unknown>;
    if (!node || typeof node !== 'object') continue;

    // Get name (required) - support various field names the LLM might use
    const name = (node.name as string) || (node.label as string) || (node.title as string);
    if (!name || typeof name !== 'string') {
      console.warn('[apply-hierarchy] Skipping node without name:', node);
      continue;
    }

    // Generate or validate id
    const currentPath = parentPath ? `${parentPath}/${name}` : name;
    let id = (node.id as string) || currentPath;

    // Ensure unique ID
    if (seenIds.has(id)) {
      id = `${id}-${i}`;
    }
    seenIds.add(id);

    // Process children recursively — support both "children" (canonical) and
    // "subtopics" (used by plan's proposed_topics) field names
    const rawChildren = Array.isArray(node.children)
      ? node.children
      : Array.isArray(node.subtopics)
        ? node.subtopics
        : undefined;
    const children = rawChildren
      ? normalizeHierarchy(rawChildren as unknown[], currentPath)
      : undefined;

    // Preserve optional fields from the incoming node
    const description = typeof node.description === 'string' ? node.description : undefined;
    // Accept camelCase and snake_case variants — LLM or plan may use either
    const rawRefs = node.sourceChunkRefs || node.source_chunk_refs || node.source_chunks;
    const sourceChunkRefs = Array.isArray(rawRefs) && rawRefs.length > 0
      ? (rawRefs as string[])
      : undefined;
    const promptTemplate = typeof node.promptTemplate === 'string' && node.promptTemplate.trim()
      ? node.promptTemplate
      : undefined;
    const normalizedPromptSegment = typeof node.normalizedPromptSegment === 'string' && node.normalizedPromptSegment.trim()
      ? node.normalizedPromptSegment
      : undefined;

    result.push({
      id,
      name,
      description,
      sourceChunkRefs,
      promptTemplate,
      normalizedPromptSegment,
      children: children && children.length > 0 ? children : undefined,
    });
  }

  return result;
}

// =============================================================================
// Plan-based ref merging — ensures sourceChunkRefs survive LLM tool calls
// =============================================================================

function allLeavesHaveRefs(nodes: readonly TopicHierarchyNode[]): boolean {
  for (const node of nodes) {
    if (node.children?.length) {
      if (!allLeavesHaveRefs(node.children)) return false;
    } else if (!node.sourceChunkRefs?.length) {
      return false;
    }
  }
  return true;
}

function countNodesWithRefs(nodes: readonly TopicHierarchyNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.sourceChunkRefs?.length) count++;
    if (node.children) count += countNodesWithRefs(node.children);
  }
  return count;
}

/**
 * When topics lack sourceChunkRefs (e.g., LLM omitted them in tool call),
 * look up the proposed plan and merge in the matching source_chunk_refs.
 * This is the key fix: the plan always has refs, but the LLM often drops
 * them when calling apply_topic_hierarchy directly.
 */
async function mergeRefsFromPlan(
  datasetId: string,
  hierarchy: TopicHierarchyNode[],
): Promise<TopicHierarchyNode[]> {
  if (allLeavesHaveRefs(hierarchy)) return hierarchy;

  let plan;
  try {
    plan = await getProposedPlan(datasetId);
  } catch (err) {
    console.warn('[apply-hierarchy] Failed to load proposed plan for ref merge:', err);
    return hierarchy;
  }
  if (!plan?.proposed_topics?.length) return hierarchy;

  // Build name → refs map from plan (flatten proposed_topics + subtopics)
  const planRefMap = new Map<string, string[]>();
  for (const topic of plan.proposed_topics) {
    if (topic.source_chunk_refs?.length) {
      planRefMap.set(topic.name.toLowerCase(), topic.source_chunk_refs);
    }
    for (const sub of topic.subtopics || []) {
      if (sub.source_chunk_refs?.length) {
        planRefMap.set(sub.name.toLowerCase(), sub.source_chunk_refs);
      }
    }
  }

  if (planRefMap.size === 0) return hierarchy;

  // Walk hierarchy and fill in missing refs (immutable — creates new nodes)
  function fillRefs(nodes: TopicHierarchyNode[]): TopicHierarchyNode[] {
    return nodes.map(node => {
      const refs = node.sourceChunkRefs || planRefMap.get(node.name.toLowerCase());
      const children = node.children ? fillRefs(node.children) : node.children;
      return { ...node, sourceChunkRefs: refs, children };
    });
  }

  const merged = fillRefs(hierarchy);
  const mergedCount = countNodesWithRefs(merged);
  console.log(`[apply-hierarchy] Merged sourceChunkRefs from plan for ${mergedCount} topics`);
  return merged;
}

export const applyTopicHierarchyHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, hierarchy } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!hierarchy || !Array.isArray(hierarchy)) {
      return { success: false, error: 'hierarchy array is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Allow hierarchy changes in not_started, topics_config or grader_config steps
    // not_started: workflow just started, first action is typically topic config
    // grader_config: users may want to refine topics while configuring the grader
    const allowedSteps = ['not_started', 'topics_config', 'grader_config'];
    if (!allowedSteps.includes(workflow.currentStep)) {
      return { success: false, error: `Cannot apply hierarchy in step ${workflow.currentStep}. Must be in not_started, topics_config, or grader_config step.` };
    }

    // Auto-advance from not_started to topics_config when topic operations begin
    if (workflow.currentStep === 'not_started') {
      await workflowService.advanceToStep(workflow_id, 'topics_config');
    }

    // Normalize and validate hierarchy structure (ensures IDs exist)
    let validHierarchy = normalizeHierarchy(hierarchy);

    // Auto-merge sourceChunkRefs from proposed plan when LLM omits them
    validHierarchy = await mergeRefsFromPlan(workflow.datasetId, validHierarchy);

    const topicCount = countLeafTopics(validHierarchy);

    if (topicCount === 0) {
      return { success: false, error: 'Hierarchy must have at least one topic' };
    }

    const depth = calculateMaxDepth(validHierarchy);

    // Ensure the objective has a normalized "You are ..." role sentence
    const dataset = await datasetService.getById(workflow.datasetId);
    let normalizedObjective = dataset?.normalizedObjective;
    if (dataset?.datasetObjective && !normalizedObjective) {
      try {
        normalizedObjective = await normalizeObjectiveToRole(dataset.datasetObjective);
        await datasetService.updateObjective(workflow.datasetId, dataset.datasetObjective, normalizedObjective);
      } catch {
        console.warn('[apply-hierarchy] Objective normalization failed, will use heuristic fallback');
      }
    }

    // Generate LLM-normalized prompt segments for natural system prompts
    if (dataset?.datasetObjective) {
      try {
        validHierarchy = await normalizeTopicSegments(
          validHierarchy,
          dataset.datasetObjective,
          normalizedObjective,
        );
      } catch {
        console.warn('[apply-hierarchy] Segment normalization failed, falling back to heuristic');
      }
    }

    // Save hierarchy to dataset (single source of truth)
    await datasetService.updateTopicHierarchy(workflow.datasetId, {
      hierarchy: validHierarchy,
      depth,
      generatedAt: Date.now(),
    });

    // Update workflow with metadata only (not the full hierarchy)
    await workflowService.updateStepData(workflow_id, 'topicsConfig', {
      topicCount,
      depth,
      generatedAt: Date.now(),
      method: 'manual',
    });

    return {
      success: true,
      applied_hierarchy: validHierarchy,
      topic_count: topicCount,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to apply hierarchy' };
  }
};

export const applyTopicHierarchyTool: DistriFnTool = {
  name: 'apply_topic_hierarchy',
  description: 'Apply a user-provided or edited topic hierarchy to the workflow. Available in topics_config and grader_config steps.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      hierarchy: {
        type: 'array',
        items: { type: 'object' },
        description: 'TopicHierarchyNode[] structure',
      },
    },
    required: ['workflow_id', 'hierarchy'],
  },
  handler: async (input) => JSON.stringify(await applyTopicHierarchyHandler(input as Record<string, unknown>)),
} as DistriFnTool;
