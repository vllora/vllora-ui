/**
 * Dataset Analysis Tools
 *
 * Tools that analyze dataset records and provide insights.
 */

import { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';

// Import individual tool handlers and definitions
import { analyzeRecordsHandler, analyzeRecordsTool } from './analyze-records';
import { generateTopicsHandler, generateTopicsTool } from './generate-topics';
import { suggestTopicsHandler, suggestTopicsTool } from './suggest-topics';
import { findDuplicatesHandler, findDuplicatesTool } from './find-duplicates';
import { summarizeDatasetHandler, summarizeDatasetTool } from './summarize-dataset';
import { compareRecordsHandler, compareRecordsTool } from './compare-records';

// Combined handlers object
export const datasetAnalysisToolHandlers: Record<string, ToolHandler> = {
  analyze_records: analyzeRecordsHandler,
  generate_topics: generateTopicsHandler,
  suggest_topics: suggestTopicsHandler,
  find_duplicates: findDuplicatesHandler,
  summarize_dataset: summarizeDatasetHandler,
  compare_records: compareRecordsHandler,
};

// Tool names constant
export const DATASET_ANALYSIS_TOOL_NAMES = [
  'analyze_records',
  'generate_topics',
  'suggest_topics',
  'find_duplicates',
  'summarize_dataset',
  'compare_records',
] as const;

export type DatasetAnalysisToolName = (typeof DATASET_ANALYSIS_TOOL_NAMES)[number];

export function isDatasetAnalysisTool(toolName: string): toolName is DatasetAnalysisToolName {
  return DATASET_ANALYSIS_TOOL_NAMES.includes(toolName as DatasetAnalysisToolName);
}

// DistriFnTool array for Chat component
export const datasetAnalysisTools: DistriFnTool[] = [
  analyzeRecordsTool,
  generateTopicsTool,
  suggestTopicsTool,
  findDuplicatesTool,
  summarizeDatasetTool,
  compareRecordsTool,
];
