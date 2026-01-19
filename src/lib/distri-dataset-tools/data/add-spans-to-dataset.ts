import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { listSpans } from '@/services/spans-api';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';
import { getCurrentProjectId } from './helpers';

export const addSpansToDatasetHandler: ToolHandler = async ({ dataset_id, span_ids, topic }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!span_ids || !Array.isArray(span_ids) || span_ids.length === 0) {
    return { success: false, error: 'span_ids array is required' };
  }
  try {
    const projectId = await getCurrentProjectId();

    // Fetch the full span objects
    const spanResult = await listSpans({
      projectId,
      params: { spanIds: (span_ids as string[]).join(','), limit: span_ids.length },
    });

    if (!spanResult.data || spanResult.data.length === 0) {
      return { success: false, error: 'No spans found with the provided IDs' };
    }

    // Add spans to dataset
    const addedCount = await datasetsDB.addSpansToDataset(
      dataset_id as string,
      spanResult.data,
      topic as string | undefined
    );

    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true, added_count: addedCount, dataset_id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add spans to dataset',
    };
  }
};

export const addSpansToDatasetTool: DistriFnTool = {
  name: 'add_spans_to_dataset',
  description: 'Add spans to a dataset by their IDs',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID to add spans to' },
      span_ids: { type: 'array', items: { type: 'string' }, description: 'Span IDs to add' },
      topic: { type: 'string', description: 'Optional topic to assign to all added records' },
    },
    required: ['dataset_id', 'span_ids'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await addSpansToDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
