import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, RecordComparison } from '../types';
import { DatasetRecord } from '@/types/dataset-types';
import { getInputSummary, getOutputSummary, calculateSimilarity } from './helpers';

export const compareRecordsHandler: ToolHandler = async ({ record_ids }) => {
  if (!record_ids || !Array.isArray(record_ids) || record_ids.length < 2) {
    return { success: false, error: 'At least 2 record_ids are required' };
  }
  try {
    const datasets = await datasetsDB.getAllDatasets();
    const foundRecords: DatasetRecord[] = [];

    for (const dataset of datasets) {
      const records = await datasetsDB.getRecordsByDatasetId(dataset.id);
      records.forEach((r) => {
        if ((record_ids as string[]).includes(r.id)) {
          foundRecords.push(r);
        }
      });
    }

    if (foundRecords.length < 2) {
      return { success: false, error: 'Could not find at least 2 records' };
    }

    const recordDetails = foundRecords.map((r) => ({
      id: r.id,
      topic: r.topic,
      source: (r.spanId ? 'span' : 'manual') as 'span' | 'manual',
      created_at: r.createdAt,
      input_summary: getInputSummary(r.data),
      output_summary: getOutputSummary(r.data),
    }));

    const similarities: number[] = [];
    for (let i = 0; i < recordDetails.length; i++) {
      for (let j = i + 1; j < recordDetails.length; j++) {
        const sim = calculateSimilarity(
          recordDetails[i].input_summary,
          recordDetails[j].input_summary
        );
        similarities.push(sim);
      }
    }
    const avgSimilarity =
      similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : 0;

    const differences: string[] = [];
    const similarityPoints: string[] = [];

    const uniqueTopics = new Set(recordDetails.map((r) => r.topic || '(none)'));
    if (uniqueTopics.size > 1) {
      differences.push(`Different topics: ${[...uniqueTopics].join(', ')}`);
    } else {
      similarityPoints.push(`Same topic: ${[...uniqueTopics][0]}`);
    }

    const uniqueSources = new Set(recordDetails.map((r) => r.source));
    if (uniqueSources.size > 1) {
      differences.push('Mixed sources (span and manual)');
    } else {
      similarityPoints.push(`All from ${[...uniqueSources][0]}`);
    }

    if (avgSimilarity >= 0.8) {
      similarityPoints.push(`High content similarity (${Math.round(avgSimilarity * 100)}%)`);
    } else if (avgSimilarity >= 0.5) {
      similarityPoints.push(`Moderate content similarity (${Math.round(avgSimilarity * 100)}%)`);
    } else {
      differences.push(`Low content similarity (${Math.round(avgSimilarity * 100)}%)`);
    }

    const comparison: RecordComparison = {
      records: recordDetails,
      differences,
      similarities: similarityPoints,
      similarity_score: avgSimilarity,
      recommendation:
        avgSimilarity >= 0.9
          ? 'These records are very similar - consider keeping only one'
          : avgSimilarity >= 0.7
            ? 'These records are moderately similar - review for consolidation'
            : 'These records are distinct - no action needed',
    };

    return { success: true, comparison };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compare records',
    };
  }
};

export const compareRecordsTool: DistriFnTool = {
  name: 'compare_records',
  description: 'Compare specific records side-by-side',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Record IDs to compare (2 or more)',
      },
    },
    required: ['record_ids'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await compareRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
