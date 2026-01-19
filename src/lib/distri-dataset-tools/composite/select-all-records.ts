import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetContext } from './types';
import { mergeWithStoredContext } from './context-store';

export const selectAllRecordsHandler: ToolHandler = async ({
  dataset_id,
  filter,
  context: passedContext,
}: {
  dataset_id?: string;
  filter?: { topic?: string };
  context?: Partial<DatasetContext>;
}) => {
  try {
    // Merge passed context with stored context (fallback for when context isn't passed through agent chain)
    const context = mergeWithStoredContext(passedContext);

    // 1. Use current dataset from context if not specified
    const targetId = dataset_id || context?.current_dataset_id;
    if (!targetId) {
      return { success: false, error: 'No dataset specified or currently viewed' };
    }

    // 2. Fetch dataset info and records from IndexedDB (with optional filter)
    const dataset = await datasetsDB.getDatasetById(targetId);
    let records = await datasetsDB.getRecordsByDatasetId(targetId);

    if (filter?.topic) {
      records = records.filter((r) => r.topic === filter.topic);
    }

    if (records.length === 0) {
      return {
        success: false,
        error: filter?.topic
          ? `No records found with topic "${filter.topic}"`
          : 'No records found in dataset',
      };
    }

    const recordIds = records.map((r) => r.id);

    // 3. Emit selection event
    emitter.emit('vllora_dataset_select_records' as any, {
      datasetId: targetId,
      recordIds,
    });

    const datasetName = dataset?.name || 'Unknown';
    return {
      success: true,
      dataset_id: targetId,
      dataset_name: datasetName,
      link: `[${datasetName}](/datasets?id=${targetId})`,
      selected_count: recordIds.length,
      filter_applied: !!filter?.topic,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to select records',
    };
  }
};

export const selectAllRecordsTool: DistriFnTool = {
  name: 'select_all_records',
  description:
    'Select all records in a dataset, optionally filtered by topic. Use this for requests like "select all records", "select all records in dataset X", "select all records with topic Y".',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description:
          'The ID of the dataset (optional - falls back to currently viewed dataset from context)',
      },
      filter: {
        type: 'object',
        description: 'Optional filter criteria',
        properties: {
          topic: {
            type: 'string',
            description: 'Only select records with this topic',
          },
        },
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
    JSON.stringify(await selectAllRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
