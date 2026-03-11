/**
 * Adjust Topic Hierarchy Tool
 *
 * Uses the backend endpoint to modify topic hierarchy via natural language instructions.
 * This is an alternative to the granular tools (add_topic, rename_topic, remove_topic)
 * that allows users to make complex modifications in a single instruction.
 */

import type { DistriFnTool } from '@distri/core';
import type { TopicHierarchyNode } from '@/types/dataset-types';
import type { ToolHandler } from '../types';
import { workflowService, datasetService } from '@/services/service-registry';
import { getBackendUrl } from '@/config/api';
import { countLeafTopics, calculateMaxDepth } from './helpers';

interface AdjustTopicHierarchyRequest {
  current_hierarchy: TopicHierarchyNode[];
  user_instruction: string;
  goals: string;
  model?: string;
  temperature?: number;
}

interface AdjustTopicHierarchyResponse {
  success: boolean;
  error?: string;
  hierarchy?: TopicHierarchyNode[];
  changes_made?: string[];
}

/**
 * Call the backend endpoint to adjust topic hierarchy
 */
async function adjustTopicsViaBackend(
  currentHierarchy: TopicHierarchyNode[],
  userInstruction: string,
  goals: string,
): Promise<AdjustTopicHierarchyResponse> {
  const url = `${getBackendUrl()}/finetune/topic-hierarchy/adjust`;

  const requestBody: AdjustTopicHierarchyRequest = {
    current_hierarchy: currentHierarchy,
    user_instruction: userInstruction,
    goals,
  };

  console.log('[adjustTopicsViaBackend] Request URL:', url);
  console.log('[adjustTopicsViaBackend] Instruction:', userInstruction);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `Backend request failed: ${response.status} ${errorText}` };
  }

  return await response.json();
}

export const adjustTopicHierarchyHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, instruction } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!instruction || typeof instruction !== 'string') {
      return { success: false, error: 'instruction is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Allow hierarchy changes in not_started, topics_config or grader_config steps
    // not_started: workflow just started, first action is typically topic config
    const allowedSteps = ['not_started', 'topics_config', 'grader_config'];
    if (!allowedSteps.includes(workflow.currentStep)) {
      return {
        success: false,
        error: `Cannot adjust hierarchy in step ${workflow.currentStep}. Must be in not_started, topics_config, or grader_config step.`,
      };
    }

    // Auto-advance from not_started to topics_config when topic operations begin
    if (workflow.currentStep === 'not_started') {
      await workflowService.advanceToStep(workflow_id, 'topics_config');
    }

    // Get current hierarchy from dataset
    const dataset = await datasetService.getById(workflow.datasetId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    const currentHierarchy = dataset.topicHierarchy?.hierarchy;
    if (!currentHierarchy || currentHierarchy.length === 0) {
      return {
        success: false,
        error: 'No existing topic hierarchy found. Please generate topics first using generate_topics.',
      };
    }

    // Call backend to adjust hierarchy
    const result = await adjustTopicsViaBackend(
      currentHierarchy,
      instruction,
      dataset.datasetObjective || workflow.trainingGoals || 'General training',
    );

    if (!result.success || !result.hierarchy) {
      return { success: false, error: result.error || 'Failed to adjust hierarchy' };
    }

    const topicCount = countLeafTopics(result.hierarchy);
    const depth = calculateMaxDepth(result.hierarchy);

    // Save updated hierarchy to dataset
    await datasetService.updateTopicHierarchy(workflow.datasetId, {
      hierarchy: result.hierarchy,
      depth,
      generatedAt: Date.now(),
    });

    // Update workflow metadata
    await workflowService.updateStepData(workflow_id, 'topicsConfig', {
      topicCount,
      depth,
      generatedAt: Date.now(),
      method: 'manual',
    });

    return {
      success: true,
      hierarchy: result.hierarchy,
      topic_count: topicCount,
      changes_made: result.changes_made || [],
      message: `Successfully adjusted topic hierarchy. ${result.changes_made?.join(', ') || 'Changes applied.'}`,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to adjust hierarchy' };
  }
};

export const adjustTopicHierarchyTool: DistriFnTool = {
  name: 'adjust_topic_hierarchy',
  description: `Modify an existing topic hierarchy using natural language instructions.
Supports operations like: add topic, rename topic, remove topic, move topic, merge topics.
Examples: "add Error Handling under Testing", "rename Basics to Fundamentals", "remove the Deprecated topic".
Available in topics_config and grader_config steps.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The workflow ID',
      },
      instruction: {
        type: 'string',
        description:
          'Natural language instruction describing the modification to make. Examples: "add Error Handling under Testing", "rename Basics to Fundamentals", "remove Deprecated topic"',
      },
    },
    required: ['workflow_id', 'instruction'],
  },
  handler: async (input) =>
    JSON.stringify(await adjustTopicHierarchyHandler(input as Record<string, unknown>)),
} as DistriFnTool;
