import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetContext } from './types';
import { mergeWithStoredContext } from './context-store';

export const createAndOpenDatasetHandler: ToolHandler = async ({
  name,
  navigate = true,
  context: passedContext,
}: {
  name?: string;
  navigate?: boolean;
  context?: Partial<DatasetContext>;
}) => {
  try {
    // Merge passed context with stored context (fallback for when context isn't passed through agent chain)
    const context = mergeWithStoredContext(passedContext);

    if (!name || typeof name !== 'string') {
      return { success: false, error: 'Dataset name is required' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Dataset name cannot be empty' };
    }

    // Auto-generate unique name if duplicate exists
    let finalName = trimmedName;
    const existingNames = new Set(
      (context?.dataset_names || []).map((d) => d.name.toLowerCase())
    );

    if (existingNames.has(finalName.toLowerCase())) {
      // Find next available number suffix
      let counter = 2;
      while (existingNames.has(`${trimmedName} (${counter})`.toLowerCase())) {
        counter++;
      }
      finalName = `${trimmedName} (${counter})`;
    }

    // 1. Create dataset in IndexedDB
    const dataset = await datasetsDB.createDataset(finalName);

    // 2. Navigate to new dataset
    if (navigate) {
      setTimeout(() => {
        emitter.emit('vllora_dataset_navigate' as any, { datasetId: dataset.id });
      }, 500);
    }

    return {
      success: true,
      dataset_id: dataset.id,
      dataset_name: dataset.name,
      link: `[${dataset.name}](/datasets?id=${dataset.id})`,
      navigated: navigate,
      message: `Created dataset "${dataset.name}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create dataset',
    };
  }
};

export const createAndOpenDatasetTool: DistriFnTool = {
  name: 'create_and_open_dataset',
  description:
    'Create a new dataset and navigate to it. Use this for requests like "create new dataset X", "create dataset called X", "make a new dataset named X".',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name for the new dataset',
      },
      navigate: {
        type: 'boolean',
        description: 'Whether to navigate to the new dataset after creation (default: true)',
      },
      context: {
        type: 'object',
        description: 'Current page context from orchestrator',
      },
    },
    required: ['name', 'context'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await createAndOpenDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
