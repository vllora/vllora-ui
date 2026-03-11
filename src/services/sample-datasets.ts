/**
 * Sample Datasets Service
 *
 * Loads and creates sample datasets from bundled example data.
 * Sample data is served from /public/samples/ folder.
 */

import { datasetService, recordService } from './service-registry';
import type { TopicHierarchyConfig, SampleTrainingConfig } from '@/types/dataset-types';

export interface SampleDatasetConfig {
  id: string;
  name: string;
  description: string;
  objective: string;
  folder: string; // e.g., "chess-tutor"
}

/**
 * Available sample datasets
 */
export const SAMPLE_DATASETS: SampleDatasetConfig[] = [
  {
    id: 'chess-tutor',
    name: 'Chess Tutor',
    description: 'An expert chess tutor helping students improve their skills',
    objective: 'Expert chess tutor helping a student improve their chess skills through position analysis, move recommendations, and strategic guidance.',
    folder: 'chess-tutor',
  },
];

/**
 * Load sample dataset files from public folder
 */
async function loadSampleFiles(folder: string) {
  const basePath = `/samples/${folder}`;

  // Load all files in parallel (training-config is optional)
  const [datasetResponse, topicsResponse, evaluationResponse, trainingConfigResponse] = await Promise.all([
    fetch(`${basePath}/dataset.jsonl`),
    fetch(`${basePath}/topics.json`),
    fetch(`${basePath}/evaluation.js`),
    fetch(`${basePath}/training-config.json`).catch(() => null),
  ]);

  if (!datasetResponse.ok) {
    throw new Error(`Failed to load dataset.jsonl: ${datasetResponse.statusText}`);
  }
  if (!topicsResponse.ok) {
    throw new Error(`Failed to load topics.json: ${topicsResponse.statusText}`);
  }
  if (!evaluationResponse.ok) {
    throw new Error(`Failed to load evaluation.js: ${evaluationResponse.statusText}`);
  }

  const datasetText = await datasetResponse.text();
  const topicsJson = await topicsResponse.json();
  const evaluationScript = await evaluationResponse.text();

  // Training config is optional
  let trainingConfig: SampleTrainingConfig | undefined;
  if (trainingConfigResponse?.ok) {
    trainingConfig = await trainingConfigResponse.json();
  }

  // Parse JSONL records and transform to expected DataInfo format
  // JSONL format: { messages: [...], tools?: [...] }
  // DataInfo format for RFT: { input: { messages: [...] }, output: {} }
  // Note: For RFT (Reinforcement Fine-Tuning), we don't need pre-written assistant responses.
  // All messages (system + user) go into input.messages.
  // Output can be empty (typical for RFT) or contain a value (both are valid).
  const records = datasetText
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        const item = JSON.parse(line);

        // Transform JSONL format to DataInfo format for RFT
        // All messages go into input.messages (no golden response needed)
        if (item.messages && Array.isArray(item.messages)) {
          const messages = item.messages as Array<Record<string, unknown>>;
          const tools = (item.tools as unknown[]) || [];

          return {
            input: {
              messages: messages,
              ...(tools.length > 0 ? { tools } : {}),
            },
            output: {},
          };
        }

        // Already in correct format or other structure
        return item;
      } catch {
        console.warn('Failed to parse JSONL line:', line);
        return null;
      }
    })
    .filter(Boolean);

  return { records, topics: topicsJson, evaluationScript, trainingConfig };
}

/**
 * Create a sample dataset with all its data
 */
export async function createSampleDataset(
  config: SampleDatasetConfig
): Promise<{ datasetId: string; recordCount: number }> {
  // Load sample files
  const { records, topics, evaluationScript, trainingConfig } = await loadSampleFiles(config.folder);

  // Create the dataset
  const dataset = await datasetService.create(
    `${config.name} (Sample)`,
    config.objective
  );

  // Add records to the dataset
  if (records.length > 0) {
    await recordService.add(
      dataset.id,
      records.map((record) => ({
        data: record,
        is_generated: false,
      }))
    );
  }

  // Set up topic hierarchy if available
  if (topics && topics.hierarchy) {
    const topicConfig: TopicHierarchyConfig = {
      goals: topics.goals || config.objective,
      depth: topics.depth || 3,
      hierarchy: topics.hierarchy,
    };
    await datasetService.updateTopicHierarchy(dataset.id, topicConfig);
  }

  // Set up evaluation script if available
  if (evaluationScript) {
    await datasetService.updateEvalScript(dataset.id, evaluationScript);
  }

  // Set up training configuration if available (for sample datasets)
  if (trainingConfig) {
    await datasetService.updateTrainingConfig(dataset.id, trainingConfig);
  }

  return {
    datasetId: dataset.id,
    recordCount: records.length,
  };
}

/**
 * Get the default sample dataset config
 */
export function getDefaultSampleDataset(): SampleDatasetConfig {
  return SAMPLE_DATASETS[0];
}
