import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetContext } from './types';
import { mergeWithStoredContext } from './context-store';

export const listAndShowDatasetsHandler: ToolHandler = async ({
  context: passedContext,
}: {
  context?: Partial<DatasetContext>;
}) => {
  try {
    // Merge passed context with stored context (fallback for when context isn't passed through agent chain)
    const context = mergeWithStoredContext(passedContext);
    // 1. Fetch all datasets from IndexedDB
    const datasets = await datasetsDB.getAllDatasets();
    const withCounts = await Promise.all(
      datasets.map(async (ds) => ({
        id: ds.id,
        name: ds.name,
        record_count: await datasetsDB.getRecordCount(ds.id),
        created_at: ds.createdAt,
        updated_at: ds.updatedAt,
        link: `[${ds.name}](/datasets?id=${ds.id})`,
      }))
    );

    // 2. Navigate to datasets list if not already there
    let navigated = false;
    if (context?.page !== 'datasets' || context?.current_view !== 'list') {
      console.log('===== listAndShowDatasetsHandler navigating to list');
      emitter.emit('vllora_dataset_navigate_to_list' as any, {});
      navigated = true;
    }

    // 3. Return combined result
    return {
      success: true,
      datasets: withCounts,
      total_count: withCounts.length,
      navigated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list datasets',
    };
  }
};

export const listAndShowDatasetsTool: DistriFnTool = {
  name: 'list_and_show_datasets',
  description:
    'List all datasets with record counts and navigate to the datasets list view. Use this for requests like "show all datasets", "list datasets", "what datasets do I have".',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      context: {
        type: 'object',
        description: 'Current page context from orchestrator',
      },
    },
    required: ['context'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await listAndShowDatasetsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
