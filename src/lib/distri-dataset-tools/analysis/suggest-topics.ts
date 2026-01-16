import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, TopicSuggestion } from '../types';
import { DatasetRecord } from '@/types/dataset-types';
import { getInputSummary, extractKeywords } from './helpers';

export const suggestTopicsHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  try {
    const records = await datasetsDB.getRecordsByDatasetId(dataset_id as string);

    if (records.length === 0) {
      return { success: false, error: 'No records to analyze' };
    }

    const groups: Map<string, DatasetRecord[]> = new Map();
    const processed = new Set<string>();

    records.forEach((record) => {
      if (processed.has(record.id)) return;

      const inputSummary = getInputSummary(record.data);
      const keywords = extractKeywords(inputSummary);
      const groupKey = keywords.slice(0, 2).join('-') || 'general';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(record);
      processed.add(record.id);
    });

    const suggestions: TopicSuggestion[] = [];
    groups.forEach((groupRecords, key) => {
      if (groupRecords.length >= 2) {
        const existingTopics = groupRecords
          .filter((r) => r.topic)
          .map((r) => r.topic!);
        const suggestedTopic =
          existingTopics.length > 0
            ? existingTopics[0]
            : key.replace(/-/g, '_');

        suggestions.push({
          suggested_topic: suggestedTopic,
          record_ids: groupRecords.map((r) => r.id),
          reason: `${groupRecords.length} records share similar content patterns`,
          confidence: Math.min(0.9, 0.5 + groupRecords.length * 0.1),
        });
      }
    });

    suggestions.sort((a, b) => b.confidence - a.confidence);

    return {
      success: true,
      suggestions: suggestions.slice(0, 10),
      total_groups: groups.size,
      records_without_suggestions: records.length -
        suggestions.reduce((sum, s) => sum + s.record_ids.length, 0),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suggest topics',
    };
  }
};

export const suggestTopicsTool: DistriFnTool = {
  name: 'suggest_topics',
  description: 'Suggest topic assignments based on content similarity',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await suggestTopicsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
