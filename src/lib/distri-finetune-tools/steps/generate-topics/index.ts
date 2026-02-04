/**
 * Generate Topics Tool
 *
 * Auto-generates topic hierarchy from dataset content.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../../types';
import type { TopicHierarchyNode } from '@/types/dataset-types';
import { countLeafTopics } from '../helpers';

import { generateTopicsViaBackend } from './backend';
import { generateTopicsViaFrontend } from './frontend';

// Feature flag: Set to true to use the backend topic hierarchy generation endpoint
// Set to false to use the existing frontend LLM-based generation
const USE_BACKEND_TOPIC_GENERATION = true;

export const generateTopicsHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, method = 'auto', max_depth = 2, degree = 2, max_topics = 3, focus } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Allow topic generation in not_started, topics_config or grader_config steps
    // not_started: workflow just started, first action is typically topic config
    // grader_config: users may want to refine topics while configuring the grader
    const allowedSteps = ['not_started', 'topics_config', 'grader_config'];
    if (!allowedSteps.includes(workflow.currentStep)) {
      return {
        success: false,
        error: `Cannot generate topics in step ${workflow.currentStep}. Must be in not_started, topics_config, or grader_config step.`,
      };
    }

    // Auto-advance from not_started to topics_config when topic operations begin
    if (workflow.currentStep === 'not_started') {
      await workflowDB.advanceToStep(workflow_id, 'topics_config');
    }

    // Parse parameters with robust type coercion (LLM may send strings instead of numbers)
    const depthValue = typeof max_depth === 'number'
      ? max_depth
      : typeof max_depth === 'string'
        ? parseInt(max_depth, 10) || 2
        : 2;
    const degreeValue = typeof degree === 'number'
      ? degree
      : typeof degree === 'string'
        ? parseInt(degree, 10) || 2
        : 2;
    const maxTopicsValue = typeof max_topics === 'number'
      ? max_topics
      : typeof max_topics === 'string'
        ? parseInt(max_topics, 10) || 3
        : 3;
    const focusValue = typeof focus === 'string' && focus.trim() ? focus.trim() : undefined;

    console.log('[generate_topics] Parameters received:', { max_depth, degree, max_topics, focus });
    console.log('[generate_topics] Parsed values:', { depthValue, degreeValue, maxTopicsValue, focusValue });

    let hierarchy: TopicHierarchyNode[];

    if (USE_BACKEND_TOPIC_GENERATION) {
      // Use backend topic hierarchy generation endpoint
      const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
      if (records.length === 0) {
        return { success: false, error: 'No records found in dataset' };
      }

      // Format records for the backend API (limit to 20 as per backend implementation)
      const formattedRecords = records.slice(0, 20).map((r) => ({ data: r.data }));

      const result = await generateTopicsViaBackend(
        workflow.trainingGoals || 'Generate diverse training data',
        depthValue,
        degreeValue,
        formattedRecords,
        maxTopicsValue,
        focusValue,
      );

      if (!result.success || !result.hierarchy) {
        return { success: false, error: result.error || 'Failed to generate topics via backend' };
      }

      hierarchy = result.hierarchy;
    } else {
      // Use existing frontend LLM-based topic generation
      const result = await generateTopicsViaFrontend(workflow.datasetId, depthValue, degreeValue);

      if (!result.success || !result.hierarchy) {
        return { success: false, error: result.error || 'Failed to generate topics' };
      }

      hierarchy = result.hierarchy;
    }

    const topicCount = countLeafTopics(hierarchy);

    // Save hierarchy to dataset (single source of truth)
    await datasetsDB.updateDatasetTopicHierarchy(workflow.datasetId, {
      goals: workflow.trainingGoals,
      depth: depthValue,
      hierarchy,
      generatedAt: Date.now(),
    });

    // Update workflow with metadata only (not the full hierarchy)
    await workflowDB.updateStepData(workflow_id, 'topicsConfig', {
      topicCount,
      depth: depthValue,
      generatedAt: Date.now(),
      method: method as 'auto' | 'template' | 'manual',
    });

    return {
      success: true,
      hierarchy,
      method,
      topic_count: topicCount,
      depth: depthValue,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate topics' };
  }
};

export const generateTopicsTool: DistriFnTool = {
  name: 'generate_topics',
  description: 'Auto-generate topic hierarchy from dataset content. Available in topics_config and grader_config steps.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      method: {
        type: 'string',
        enum: ['auto', 'template', 'manual'],
        default: 'auto',
        description: 'Method for generating topics',
      },
      max_depth: { type: 'number', default: 2, description: 'Maximum hierarchy depth (1-5 levels)' },
      degree: { type: 'number', default: 2, description: 'Branching factor (children per topic)' },
      max_topics: { type: 'number', default: 3, description: 'Maximum number of root topics' },
      focus: {
        type: 'string',
        description:
          'Optional user guidance for topic generation. Examples: "focus on error handling scenarios", "organize by difficulty level", "emphasize edge cases", "structure around user journey stages"',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await generateTopicsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
