import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const bulkAssignTopicHandler: ToolHandler = async ({ dataset_id, record_ids, topic }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
    return { success: false, error: 'record_ids array is required' };
  }
  try {
    for (const recordId of record_ids as string[]) {
      await datasetsDB.updateRecordTopic(
        dataset_id as string,
        recordId,
        (topic as string) || ''
      );
    }
    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true, updated_count: record_ids.length, topic: topic || '(cleared)' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk assign topic',
    };
  }
};

export const bulkAssignTopicTool: DistriFnTool = {
  name: 'bulk_assign_topic',
  description: 'Assign the same topic to multiple records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_ids: { type: 'array', items: { type: 'string' }, description: 'Record IDs to update' },
      topic: { type: 'string', description: 'The topic to assign (empty string to clear)' },
    },
    required: ['dataset_id', 'record_ids', 'topic'],
  },
  handler: async (input: object) =>
    JSON.stringify(await bulkAssignTopicHandler(input as Record<string, unknown>)),
} as DistriFnTool;
