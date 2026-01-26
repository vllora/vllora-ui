/**
 * Composite Dataset Tools
 *
 * Combined workflow tools that perform both data and UI operations.
 * Used by the vllora_dataset_composite sub-agent for common workflows.
 *
 * These tools reduce LLM round trips by combining:
 * - Data operations (IndexedDB access)
 * - UI operations (event emission)
 *
 * All tools receive the full orchestrator context.
 */

import { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';

// Import individual tool handlers and definitions
import {
  listAndShowDatasetsHandler,
  listAndShowDatasetsTool,
} from './list-and-show-datasets';
import {
  viewDatasetDetailsHandler,
  viewDatasetDetailsTool,
} from './view-dataset-details';
import {
  selectAllRecordsHandler,
  selectAllRecordsTool,
} from './select-all-records';
import {
  createAndOpenDatasetHandler,
  createAndOpenDatasetTool,
} from './create-and-open-dataset';
import {
  deleteDatasetWorkflowHandler,
  deleteDatasetWorkflowTool,
} from './delete-dataset-workflow';

// Re-export types
export type { DatasetContext, CompositeToolParams } from './types';

// Re-export context store functions
export {
  setDatasetContext,
  getDatasetContext,
  clearDatasetContext,
  mergeWithStoredContext,
} from './context-store';

// Combined handlers object
export const compositeToolHandlers: Record<string, ToolHandler> = {
  list_and_show_datasets: listAndShowDatasetsHandler,
  view_dataset_details: viewDatasetDetailsHandler,
  select_all_records: selectAllRecordsHandler,
  create_and_open_dataset: createAndOpenDatasetHandler,
  delete_dataset_workflow: deleteDatasetWorkflowHandler,
};

// Tool names constant
export const COMPOSITE_TOOL_NAMES = [
  'list_and_show_datasets',
  'view_dataset_details',
  'select_all_records',
  'create_and_open_dataset',
  'delete_dataset_workflow',
] as const;

export type CompositeToolName = (typeof COMPOSITE_TOOL_NAMES)[number];

export function isCompositeTool(toolName: string): toolName is CompositeToolName {
  return COMPOSITE_TOOL_NAMES.includes(toolName as CompositeToolName);
}

// DistriFnTool array for Chat component
export const compositeTools: DistriFnTool[] = [
  listAndShowDatasetsTool,
  viewDatasetDetailsTool,
  selectAllRecordsTool,
  createAndOpenDatasetTool,
  deleteDatasetWorkflowTool,
];

// Re-export individual handlers and tools for direct use
export {
  listAndShowDatasetsHandler,
  listAndShowDatasetsTool,
  viewDatasetDetailsHandler,
  viewDatasetDetailsTool,
  selectAllRecordsHandler,
  selectAllRecordsTool,
  createAndOpenDatasetHandler,
  createAndOpenDatasetTool,
  deleteDatasetWorkflowHandler,
  deleteDatasetWorkflowTool,
};
