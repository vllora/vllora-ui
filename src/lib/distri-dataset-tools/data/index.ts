/**
 * Dataset Data Tools
 *
 * Tools that perform CRUD operations on datasets stored in IndexedDB.
 */

import { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';

// Import individual tool handlers and definitions
import { listDatasetsHandler, listDatasetsTool } from './list-datasets';
import { getDatasetRecordsHandler, getDatasetRecordsTool } from './get-dataset-records';
import { getDatasetStatsHandler, getDatasetStatsTool } from './get-dataset-stats';
import { createDatasetHandler, createDatasetTool } from './create-dataset';
import { renameDatasetHandler, renameDatasetTool } from './rename-dataset';
import { deleteDatasetHandler, deleteDatasetTool } from './delete-dataset';
import { deleteRecordsHandler, deleteRecordsTool } from './delete-records';
import { updateRecordTopicHandler, updateRecordTopicTool } from './update-record-topic';
import { updateRecordDataHandler, updateRecordDataTool } from './update-record-data';
import { bulkAssignTopicHandler, bulkAssignTopicTool } from './bulk-assign-topic';
import { fetchSpansHandler, fetchSpansTool } from './fetch-spans';
import { addSpansToDatasetHandler, addSpansToDatasetTool } from './add-spans-to-dataset';

// Combined handlers object
export const datasetDataToolHandlers: Record<string, ToolHandler> = {
  list_datasets: listDatasetsHandler,
  get_dataset_records: getDatasetRecordsHandler,
  get_dataset_stats: getDatasetStatsHandler,
  create_dataset: createDatasetHandler,
  rename_dataset: renameDatasetHandler,
  delete_dataset: deleteDatasetHandler,
  delete_records: deleteRecordsHandler,
  update_record_topic: updateRecordTopicHandler,
  update_record_data: updateRecordDataHandler,
  bulk_assign_topic: bulkAssignTopicHandler,
  fetch_spans: fetchSpansHandler,
  add_spans_to_dataset: addSpansToDatasetHandler,
};

// Tool names constant
export const DATASET_DATA_TOOL_NAMES = [
  'list_datasets',
  'get_dataset_records',
  'get_dataset_stats',
  'create_dataset',
  'rename_dataset',
  'delete_dataset',
  'delete_records',
  'update_record_topic',
  'update_record_data',
  'bulk_assign_topic',
  'fetch_spans',
  'add_spans_to_dataset',
] as const;

export type DatasetDataToolName = (typeof DATASET_DATA_TOOL_NAMES)[number];

export function isDatasetDataTool(toolName: string): toolName is DatasetDataToolName {
  return DATASET_DATA_TOOL_NAMES.includes(toolName as DatasetDataToolName);
}

// DistriFnTool array for Chat component
export const datasetDataTools: DistriFnTool[] = [
  listDatasetsTool,
  getDatasetRecordsTool,
  getDatasetStatsTool,
  createDatasetTool,
  renameDatasetTool,
  deleteDatasetTool,
  deleteRecordsTool,
  updateRecordTopicTool,
  updateRecordDataTool,
  bulkAssignTopicTool,
  fetchSpansTool,
  addSpansToDatasetTool,
];
