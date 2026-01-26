/**
 * Dataset UI Tools
 *
 * Tools that control the Datasets page UI via event emission.
 * React components listen for these events and update accordingly.
 */

import { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';

// Re-export event types
export type { DatasetUiEvents } from './events';

// Import individual tool handlers and definitions
import { navigateToDatasetHandler, navigateToDatasetTool } from './navigate-to-dataset';
import { expandDatasetHandler, expandDatasetTool } from './expand-dataset';
import { collapseDatasetHandler, collapseDatasetTool } from './collapse-dataset';
import { selectRecordsHandler, selectRecordsTool } from './select-records';
import { clearSelectionHandler, clearSelectionTool } from './clear-selection';
import { openRecordEditorHandler, openRecordEditorTool } from './open-record-editor';
import { closeRecordEditorHandler, closeRecordEditorTool } from './close-record-editor';
import { setSearchQueryHandler, setSearchQueryTool } from './set-search-query';
import { setSortHandler, setSortTool } from './set-sort';
import { showAssignTopicDialogHandler, showAssignTopicDialogTool } from './show-assign-topic-dialog';
import { exportDatasetHandler, exportDatasetTool } from './export-dataset';

// Combined handlers object
export const datasetUiToolHandlers: Record<string, ToolHandler> = {
  navigate_to_dataset: navigateToDatasetHandler,
  expand_dataset: expandDatasetHandler,
  collapse_dataset: collapseDatasetHandler,
  select_records: selectRecordsHandler,
  clear_selection: clearSelectionHandler,
  open_record_editor: openRecordEditorHandler,
  close_record_editor: closeRecordEditorHandler,
  set_search_query: setSearchQueryHandler,
  set_sort: setSortHandler,
  show_assign_topic_dialog: showAssignTopicDialogHandler,
  export_dataset: exportDatasetHandler,
};

// Tool names constant
export const DATASET_UI_TOOL_NAMES = [
  'navigate_to_dataset',
  'expand_dataset',
  'collapse_dataset',
  'select_records',
  'clear_selection',
  'open_record_editor',
  'close_record_editor',
  'set_search_query',
  'set_sort',
  'show_assign_topic_dialog',
  'export_dataset',
] as const;

export type DatasetUiToolName = (typeof DATASET_UI_TOOL_NAMES)[number];

export function isDatasetUiTool(toolName: string): toolName is DatasetUiToolName {
  return DATASET_UI_TOOL_NAMES.includes(toolName as DatasetUiToolName);
}

// DistriFnTool array for Chat component
export const datasetUiTools: DistriFnTool[] = [
  navigateToDatasetTool,
  expandDatasetTool,
  collapseDatasetTool,
  selectRecordsTool,
  clearSelectionTool,
  openRecordEditorTool,
  closeRecordEditorTool,
  setSearchQueryTool,
  setSortTool,
  showAssignTopicDialogTool,
  exportDatasetTool,
];
