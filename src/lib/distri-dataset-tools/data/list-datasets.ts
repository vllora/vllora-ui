import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, DatasetListItem } from '../types';

export const listDatasetsHandler: ToolHandler = async () => {
  try {
    const datasets = await datasetsDB.getAllDatasets();
    const withCounts: DatasetListItem[] = await Promise.all(
      datasets.map(async (ds) => ({
        id: ds.id,
        name: ds.name,
        record_count: await datasetsDB.getRecordCount(ds.id),
        created_at: ds.createdAt,
        updated_at: ds.updatedAt,
      }))
    );
    return {
      success: true,
      datasets: withCounts,
      total_count: withCounts.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list datasets',
    };
  }
};

export const listDatasetsTool: DistriFnTool = {
  name: 'list_datasets',
  description: 'Get all datasets with their record counts',
  type: 'function',
  parameters: { type: 'object', properties: {} },
  handler: async () => JSON.stringify(await listDatasetsHandler({})),
} as DistriFnTool;
