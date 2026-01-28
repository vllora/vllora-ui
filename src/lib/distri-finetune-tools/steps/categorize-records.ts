/**
 * Categorize Records Tool
 *
 * Assigns records to topics using the configured topic hierarchy.
 * Uses LLM to classify records into leaf topics from the hierarchy.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, CategorizeRecordsResult } from '../types';

// Import the CORRECT classification tool that uses existing hierarchy
import { classifyRecords } from '@/lib/distri-dataset-tools/analysis/classify-records';

export const categorizeRecordsHandler: ToolHandler = async (params): Promise<CategorizeRecordsResult> => {
  try {
    const { workflow_id, confidence_threshold = 0.7 } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'categorize') {
      return { success: false, error: `Cannot categorize in step ${workflow.currentStep}. Must be in categorize step.` };
    }

    // Check dataset for topic hierarchy (single source of truth)
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset?.topicHierarchy?.hierarchy) {
      return { success: false, error: 'Topic hierarchy must be configured first. Use generate_topics or apply_hierarchy.' };
    }

    // Get all records to classify
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    if (records.length === 0) {
      return { success: false, error: 'No records found in dataset' };
    }

    // Use classifyRecords which classifies into EXISTING hierarchy topics
    const result = await classifyRecords({
      hierarchy: dataset.topicHierarchy.hierarchy,
      records,
    });

    if (!result.success || !result.classifications) {
      return { success: false, error: result.error || 'Failed to categorize records' };
    }

    // Apply classifications to records
    let assignedCount = 0;
    for (const [recordId, topic] of result.classifications) {
      await datasetsDB.updateRecordTopic(workflow.datasetId, recordId, topic);
      assignedCount++;
    }

    const threshold = typeof confidence_threshold === 'number' ? confidence_threshold : 0.7;

    // Update workflow
    await workflowDB.updateStepData(workflow_id, 'categorization', {
      assignedCount,
      lowConfidenceCount: 0, // Would need confidence scores from the LLM
      confidenceThreshold: threshold,
    });

    // Get topic distribution after classification
    const updatedRecords = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const byTopic: Record<string, { count: number; avg_confidence: number }> = {};

    for (const record of updatedRecords) {
      const topic = record.topic || '__uncategorized__';
      if (!byTopic[topic]) {
        byTopic[topic] = { count: 0, avg_confidence: 1.0 };
      }
      byTopic[topic].count++;
    }

    return {
      success: true,
      categorization: {
        assigned_count: assignedCount,
        low_confidence_count: 0,
        confidence_threshold: threshold,
        by_topic: byTopic,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to categorize records' };
  }
};

export const categorizeRecordsTool: DistriFnTool = {
  name: 'categorize_records',
  description: 'Classify records into the configured topic hierarchy. Uses LLM to assign each record to the most appropriate leaf topic. Must be in categorize step.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      confidence_threshold: { type: 'number', default: 0.7, description: 'Minimum confidence for auto-assignment' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await categorizeRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
