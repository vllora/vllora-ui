import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, DuplicateGroup } from '../types';
import { getInputSummary, calculateSimilarity } from './helpers';

export const findDuplicatesHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  try {
    const records = await datasetsDB.getRecordsByDatasetId(dataset_id as string);

    if (records.length < 2) {
      return {
        success: true,
        duplicates: [],
        message: 'Not enough records to check for duplicates',
      };
    }

    const duplicateGroups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      if (processed.has(records[i].id)) continue;

      const record1 = records[i];
      const input1 = getInputSummary(record1.data);
      const group: string[] = [record1.id];
      let maxSimilarity = 0;

      for (let j = i + 1; j < records.length; j++) {
        if (processed.has(records[j].id)) continue;

        const record2 = records[j];
        const input2 = getInputSummary(record2.data);

        const similarity = calculateSimilarity(input1, input2);

        if (similarity >= 0.7) {
          group.push(record2.id);
          processed.add(record2.id);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }
      }

      if (group.length > 1) {
        processed.add(record1.id);
        duplicateGroups.push({
          record_ids: group,
          similarity_score: maxSimilarity,
          similarity_type:
            maxSimilarity >= 0.95 ? 'exact' : maxSimilarity >= 0.85 ? 'near' : 'similar',
          sample_content: input1.slice(0, 100),
        });
      }
    }

    duplicateGroups.sort((a, b) => b.similarity_score - a.similarity_score);

    const totalDuplicates = duplicateGroups.reduce(
      (sum, g) => sum + g.record_ids.length,
      0
    );

    return {
      success: true,
      duplicates: duplicateGroups,
      total_duplicate_records: totalDuplicates,
      groups_found: duplicateGroups.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find duplicates',
    };
  }
};

export const findDuplicatesTool: DistriFnTool = {
  name: 'find_duplicates',
  description: 'Find potential duplicate or near-duplicate records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await findDuplicatesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
