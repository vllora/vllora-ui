import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const updateRecordTopicHandler: ToolHandler = async ({ dataset_id, record_id, topic }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_id) {
    return { success: false, error: 'record_id is required' };
  }
  try {
    await datasetsDB.updateRecordTopic(
      dataset_id as string,
      record_id as string,
      (topic as string) || ''
    );
    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true, updated_topic: topic || '(cleared)' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update topic',
    };
  }
};

export const updateRecordTopicTool: DistriFnTool = {
  name: 'update_record_topic',
  description: 'Update the topic for a single record',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_id: { type: 'string', description: 'The record ID' },
      topic: { type: 'string', description: 'The new topic (empty string to clear)' },
    },
    required: ['dataset_id', 'record_id', 'topic'],
  },
  handler: async (input: object) =>
    JSON.stringify(await updateRecordTopicHandler(input as Record<string, unknown>)),
} as DistriFnTool;
