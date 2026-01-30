/**
 * Distri Dataset Tools
 *
 * Tools for the vLLora Datasets page agent integration.
 * Organized into four categories:
 * - Composite Tools: Combined data + UI workflows for common operations (fast path)
 * - UI Tools: Control the Datasets page UI (navigation, selection, etc.)
 * - Data Tools: CRUD operations on datasets and records
 * - Analysis Tools: Analyze records, suggest topics, find duplicates
 */

import { DistriFnTool } from '@distri/core';

// Import from subdirectories
import {
  compositeToolHandlers,
  compositeTools,
  COMPOSITE_TOOL_NAMES,
  isCompositeTool,
  type CompositeToolName,
} from './composite';

import {
  datasetUiToolHandlers,
  datasetUiTools,
  DATASET_UI_TOOL_NAMES,
  isDatasetUiTool,
  type DatasetUiToolName,
} from './ui';

import {
  datasetDataToolHandlers,
  datasetDataTools,
  DATASET_DATA_TOOL_NAMES,
  isDatasetDataTool,
  type DatasetDataToolName,
} from './data';

import {
  datasetAnalysisToolHandlers,
  datasetAnalysisTools,
  DATASET_ANALYSIS_TOOL_NAMES,
  isDatasetAnalysisTool,
  type DatasetAnalysisToolName,
} from './analysis';

// Re-export types
export type { ToolHandler, DatasetStats, DatasetListItem } from './types';
export type { TopicSuggestion, DuplicateGroup, DatasetSummary, RecordComparison } from './types';
export type { DatasetContext, CompositeToolParams } from './composite';

// Re-export context store functions (for datasets page to update context)
export {
  setDatasetContext,
  getDatasetContext,
  clearDatasetContext,
} from './composite';

// Re-export event types
export type { DatasetUiEvents } from './ui/events';

// ============================================================================
// Combined Tool Handlers
// ============================================================================

export const datasetToolHandlers: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  ...compositeToolHandlers,
  ...datasetUiToolHandlers,
  ...datasetDataToolHandlers,
  ...datasetAnalysisToolHandlers,
};

// ============================================================================
// Tool Name Constants
// ============================================================================

export const DATASET_TOOL_NAMES = [
  ...COMPOSITE_TOOL_NAMES,
  ...DATASET_UI_TOOL_NAMES,
  ...DATASET_DATA_TOOL_NAMES,
  ...DATASET_ANALYSIS_TOOL_NAMES,
] as const;

export type DatasetToolName =
  | CompositeToolName
  | DatasetUiToolName
  | DatasetDataToolName
  | DatasetAnalysisToolName;

// ============================================================================
// Tool Type Checkers
// ============================================================================

export function isDatasetTool(toolName: string): toolName is DatasetToolName {
  return (
    isCompositeTool(toolName) ||
    isDatasetUiTool(toolName) ||
    isDatasetDataTool(toolName) ||
    isDatasetAnalysisTool(toolName)
  );
}

// Re-export individual type checkers
export { isCompositeTool, isDatasetUiTool, isDatasetDataTool, isDatasetAnalysisTool };

// ============================================================================
// Execute Tool
// ============================================================================

/**
 * Execute a dataset tool by name
 */
export async function executeDatasetTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = datasetToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown dataset tool: ${toolName}`);
  }
  return handler(params);
}

// ============================================================================
// DistriFnTool[] Arrays
// ============================================================================

// Individual tool arrays for selective use
export { compositeTools, datasetUiTools, datasetDataTools, datasetAnalysisTools };

// Combined array of all dataset tools
export const datasetTools: DistriFnTool[] = [
  ...compositeTools,
  ...datasetUiTools,
  ...datasetDataTools,
  ...datasetAnalysisTools,
];

// ============================================================================
// Tool Names by Agent
// ============================================================================

/**
 * Tools for the vllora-dataset-composite agent
 * Combined data + UI workflows for common operations (fast path)
 */
export const DATASET_COMPOSITE_AGENT_TOOLS = COMPOSITE_TOOL_NAMES;

/**
 * Tools for the vllora-dataset-ui agent
 */
export const DATASET_UI_AGENT_TOOLS = DATASET_UI_TOOL_NAMES;

/**
 * Tools for the vllora-dataset-data agent
 */
export const DATASET_DATA_AGENT_TOOLS = DATASET_DATA_TOOL_NAMES;

/**
 * Tools for the vllora-dataset-analysis agent
 * Note: Also includes get_dataset_records for data access
 */
export const DATASET_ANALYSIS_AGENT_TOOLS = [
  'get_dataset_records', // Data access for analysis
  ...DATASET_ANALYSIS_TOOL_NAMES,
] as const;

// ============================================================================
// Default Export
// ============================================================================

export default {
  tools: datasetTools,
  handlers: datasetToolHandlers,
  execute: executeDatasetTool,
  isDatasetTool,
};
