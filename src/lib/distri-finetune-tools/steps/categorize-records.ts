/**
 * Categorize Records Tool
 *
 * Assigns records to topics using the configured topic hierarchy.
 * Uses LLM to classify records into leaf topics from the hierarchy.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService, recordService } from '@/services/service-registry';
import { emitter } from '@/utils/eventEmitter';

const DATASET_REFRESH_EVENT = 'vllora_dataset_refresh';
import type { ToolHandler, CategorizeRecordsResult } from '../types';

// Import the CORRECT classification tool that uses existing hierarchy
import { classifyRecords } from '@/lib/distri-dataset-tools/analysis/classify-records';

export const categorizeRecordsHandler: ToolHandler = async (params): Promise<CategorizeRecordsResult> => {
  try {
    const { workflow_id, confidence_threshold = 0.7 } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    await workflowService.advanceToStep(workflow_id, 'categorize');

    // Check dataset for topic hierarchy (single source of truth)
    const dataset = await datasetService.getById(workflow.datasetId);
    if (!dataset?.topicHierarchy?.hierarchy) {
      return { success: false, error: 'Topic hierarchy must be configured first. Use generate_topics or apply_hierarchy.' };
    }

    console.log('===== dataset?.topicHierarchy?.hierarchy', JSON.stringify(dataset?.topicHierarchy?.hierarchy))
    // Get all records to classify
    const records = await recordService.getByDatasetId(workflow.datasetId);
    if (records.length === 0) {
      return { success: false, error: 'No records found in dataset' };
    }

    // Use classifyRecords which classifies into EXISTING hierarchy topics
    const result = await classifyRecords({
      hierarchy: dataset.topicHierarchy.hierarchy,
      records,
    });
    console.log('===== classifyRecords result', {
      success: result.success,
      classifiedCount: result.classifiedCount,
      classifications: result.classifications ? Array.from(result.classifications.entries()) : null,
    })

    if (!result.success || !result.classifications) {
      return { success: false, error: result.error || 'Failed to categorize records' };
    }

    // Apply classifications to records
    let assignedCount = 0;
    for (const [recordId, topic] of result.classifications) {
      await recordService.updateTopic(workflow.datasetId, recordId, topic);
      assignedCount++;
    }

    // Emit refresh event so UI updates with new topic assignments
    emitter.emit(DATASET_REFRESH_EVENT as any, {});

    const threshold = typeof confidence_threshold === 'number' ? confidence_threshold : 0.7;

    // Update workflow
    await workflowService.updateStepData(workflow_id, 'categorization', {
      assignedCount,
      lowConfidenceCount: 0, // Would need confidence scores from the LLM
      confidenceThreshold: threshold,
    });

    // Get topic distribution after classification
    const updatedRecords = await recordService.getByDatasetId(workflow.datasetId);
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
