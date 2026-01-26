import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const selectRecordsHandler: ToolHandler = async ({ dataset_id, record_ids }) => {
  if (!dataset_id || typeof dataset_id !== 'string') {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_ids || !Array.isArray(record_ids)) {
    return { success: false, error: 'record_ids array is required' };
  }

  // Validate dataset exists
  const dataset = await datasetsDB.getDatasetById(dataset_id as string);
  if (!dataset) {
    return { success: false, error: `Dataset with id '${dataset_id}' not found` };
  }

  // Validate records exist in the dataset
  const existingRecords = await datasetsDB.getRecordsByDatasetId(dataset_id as string);
  const existingRecordIds = new Set(existingRecords.map(r => r.id));
  const requestedIds = record_ids as string[];
  const validIds = requestedIds.filter(id => existingRecordIds.has(id));
  const invalidIds = requestedIds.filter(id => !existingRecordIds.has(id));

  if (validIds.length === 0) {
    return {
      success: false,
      error: `None of the provided record IDs exist in dataset '${dataset.name}'. Invalid IDs: ${invalidIds.join(', ')}`,
    };
  }

  // Select only valid records
  emitter.emit('vllora_dataset_select_records' as any, {
    datasetId: dataset_id as string,
    recordIds: validIds
  });

  if (invalidIds.length > 0) {
    return {
      success: true,
      dataset_id,
      selected_count: validIds.length,
      warning: `${invalidIds.length} record ID(s) not found and skipped: ${invalidIds.join(', ')}`,
    };
  }

  return { success: true, dataset_id, selected_count: validIds.length };
};

export const selectRecordsTool: DistriFnTool = {
  name: 'select_records',
  description: 'Select specific records by their IDs within a dataset',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The ID of the dataset containing the records',
      },
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of record IDs to select',
      },
    },
    required: ['dataset_id', 'record_ids'],
  },
  handler: async (input: object) =>
    JSON.stringify(await selectRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
