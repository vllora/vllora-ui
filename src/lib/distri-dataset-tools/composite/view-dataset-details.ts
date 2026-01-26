import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetContext } from './types';
import { mergeWithStoredContext } from './context-store';

export const viewDatasetDetailsHandler: ToolHandler = async ({
  dataset_id,
  dataset_name,
  context: passedContext,
}: {
  dataset_id?: string;
  dataset_name?: string;
  context?: Partial<DatasetContext>;
}) => {
  try {
    // Merge passed context with stored context (fallback for when context isn't passed through agent chain)
    const context = mergeWithStoredContext(passedContext);

    // 1. Resolve dataset ID from name using context.dataset_names
    let targetId = dataset_id;
    if (!targetId && dataset_name) {
      const match = context?.dataset_names?.find(
        (d) => d.name.toLowerCase() === dataset_name.toLowerCase()
      );
      if (!match) {
        return { success: false, error: `Dataset "${dataset_name}" not found` };
      }
      targetId = match.id;
    }

    if (!targetId) {
      return { success: false, error: 'dataset_id or dataset_name required' };
    }

    // 2. Fetch dataset and stats from IndexedDB
    const dataset = await datasetsDB.getDatasetById(targetId);
    if (!dataset) {
      return { success: false, error: `Dataset ${targetId} not found` };
    }

    const recordCount = await datasetsDB.getRecordCount(targetId);
    const records = await datasetsDB.getRecordsByDatasetId(targetId);

    // Calculate topic stats
    const topicCounts: Record<string, number> = {};
    records.forEach((r) => {
      const topic = r.topic || 'uncategorized';
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });

    // 3. Navigate to dataset detail view if not already there
    const needsNavigation = context?.current_dataset_id !== targetId;
    if (needsNavigation) {
      emitter.emit('vllora_dataset_navigate' as any, { datasetId: targetId });
    }

    return {
      success: true,
      dataset_id: targetId,
      dataset_name: dataset.name,
      link: `[${dataset.name}](/datasets?id=${targetId})`,
      record_count: recordCount,
      topic_counts: topicCounts,
      created_at: dataset.createdAt,
      navigated: needsNavigation,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to view dataset details',
    };
  }
};

export const viewDatasetDetailsTool: DistriFnTool = {
  name: 'view_dataset_details',
  description:
    'Get dataset statistics and navigate to the dataset detail view. Use this for requests like "open dataset X", "go to dataset X", "show me dataset X".',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The ID of the dataset to view (optional if dataset_name provided)',
      },
      dataset_name: {
        type: 'string',
        description: 'The name of the dataset to view (will be resolved to ID using context)',
      },
      context: {
        type: 'object',
        description: 'Current page context from orchestrator',
      },
    },
    required: ['context'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await viewDatasetDetailsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
