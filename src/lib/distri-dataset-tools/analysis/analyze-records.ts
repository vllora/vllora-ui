import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import { getInputSummary, extractKeywords } from './helpers';

export const analyzeRecordsHandler: ToolHandler = async ({ dataset_id, record_ids }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  try {
    let records = await datasetsDB.getRecordsByDatasetId(dataset_id as string);

    if (record_ids && Array.isArray(record_ids)) {
      const idsSet = new Set(record_ids as string[]);
      records = records.filter((r) => idsSet.has(r.id));
    }

    if (records.length === 0) {
      return { success: false, error: 'No records found to analyze' };
    }

    const analysis = {
      total_records: records.length,
      with_topic: records.filter((r) => r.topic).length,
      without_topic: records.filter((r) => !r.topic).length,
      from_spans: records.filter((r) => r.spanId).length,
      manual: records.filter((r) => !r.spanId).length,
      topics: {} as Record<string, number>,
      common_patterns: [] as string[],
      recommendations: [] as string[],
    };

    records.forEach((r) => {
      if (r.topic) {
        analysis.topics[r.topic] = (analysis.topics[r.topic] || 0) + 1;
      }
    });

    const allKeywords: Record<string, number> = {};
    records.forEach((r) => {
      const inputSummary = getInputSummary(r.data);
      const keywords = extractKeywords(inputSummary);
      keywords.forEach((k) => {
        allKeywords[k] = (allKeywords[k] || 0) + 1;
      });
    });

    analysis.common_patterns = Object.entries(allKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => `"${word}" (${count} occurrences)`);

    if (analysis.without_topic > 0) {
      analysis.recommendations.push(
        `${analysis.without_topic} records need topic assignment`
      );
    }
    if (Object.keys(analysis.topics).length === 0) {
      analysis.recommendations.push(
        'Consider organizing records by topic for better management'
      );
    }
    if (records.length > 50 && Object.keys(analysis.topics).length < 3) {
      analysis.recommendations.push(
        'Large dataset with few topics - consider more granular categorization'
      );
    }

    return { success: true, analysis };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze records',
    };
  }
};

export const analyzeRecordsTool: DistriFnTool = {
  name: 'analyze_records',
  description: 'Analyze records in a dataset for patterns, topics, and issues',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: specific record IDs to analyze (default: all)',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await analyzeRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
