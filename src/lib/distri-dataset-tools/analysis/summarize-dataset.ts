import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, DatasetSummary } from '../types';

export const summarizeDatasetHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  try {
    const datasets = await datasetsDB.getAllDatasets();
    const dataset = datasets.find((d) => d.id === dataset_id);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    const records = await datasetsDB.getRecordsByDatasetId(dataset_id as string);

    const topics: Record<string, number> = {};
    const scoreDistribution: Record<number, number> = {};
    let totalScore = 0;
    let scoredCount = 0;

    records.forEach((r) => {
      if (r.topic) {
        topics[r.topic] = (topics[r.topic] || 0) + 1;
      }
      if (r.evaluation?.score !== undefined) {
        const score = Math.round(r.evaluation.score);
        scoreDistribution[score] = (scoreDistribution[score] || 0) + 1;
        totalScore += r.evaluation.score;
        scoredCount++;
      }
    });

    const timestamps = records.map((r) => r.createdAt);
    const recommendations: string[] = [];

    const withoutTopic = records.filter((r) => !r.topic).length;
    if (withoutTopic > 0) {
      recommendations.push(`${withoutTopic} records need topic assignment`);
    }

    const unevaluated = records.length - scoredCount;
    if (unevaluated > records.length * 0.5) {
      recommendations.push(
        `${unevaluated} records (${Math.round((unevaluated / records.length) * 100)}%) are not evaluated`
      );
    }

    if (Object.keys(topics).length > 10) {
      recommendations.push('Consider consolidating similar topics');
    }

    const summary: DatasetSummary = {
      total_records: records.length,
      from_spans: records.filter((r) => r.spanId).length,
      manual: records.filter((r) => !r.spanId).length,
      topics,
      evaluation_stats: {
        evaluated: scoredCount,
        average_score: scoredCount > 0 ? totalScore / scoredCount : null,
        score_distribution: scoreDistribution,
      },
      date_range: {
        earliest: Math.min(...timestamps),
        latest: Math.max(...timestamps),
      },
      recommendations,
    };

    return {
      success: true,
      dataset_name: dataset.name,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to summarize dataset',
    };
  }
};

export const summarizeDatasetTool: DistriFnTool = {
  name: 'summarize_dataset',
  description: 'Generate a comprehensive summary of a dataset',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await summarizeDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
