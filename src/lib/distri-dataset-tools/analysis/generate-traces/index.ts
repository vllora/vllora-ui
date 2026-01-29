/**
 * Generate Traces - Main Entry Point
 *
 * Generates synthetic trace records and adds them to a dataset.
 * Supports two modes:
 * - RFT (default): Varied prompts with empty output for reinforcement learning
 * - SFT: Complete multi-turn conversations for supervised fine-tuning
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { DataInfo, DatasetRecord } from '@/types/dataset-types';
import type { ToolHandler } from '../../types';

// Import types
import type {
  GenerateTracesParams,
  GenerateTracesResult,
  TopicGenerationTask,
  TopicGenerationResult,
  GenerationCallbacks,
  SyntheticTraceRecord,
  LeafTopic,
} from './types';
import {
  DEFAULT_MAX_TURNS,
  DEFAULT_CONCURRENCY,
  DEFAULT_RECORDS_PER_TOPIC,
  DEFAULT_BATCH_SIZE,
} from './types';

// Import utilities
import { setLLMConcurrency } from './llm';
import {
  extractLeafTopicsFromHierarchy,
  extractSeedTools,
  extractSeedMessages,
  extractSeedSystemPrompt,
  buildSyntheticTraceDataInfo,
} from './utils';

// Import generators
import { generateRFTRecord, buildRFTDataInfo } from './rft-generator';
import { simulateConversation } from './sft-generator';

// Re-export types for external use
export type { GenerateTracesParams, GenerateTracesResult } from './types';

/**
 * Generate a single record for a topic
 * Returns the record data or null if generation failed
 */
async function generateSingleRecord(
  task: TopicGenerationTask,
  recordIndex: number,
  turns: number,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<{ record: TopicGenerationResult['records'][0]; error?: string } | { record: null; error: string }> {
  console.log(`[generateSingleRecord] Starting record ${recordIndex + 1} for topic "${task.topicName}" (mode: ${task.generationMode})`);
  try {
    const seedRecord = task.seedRecords[recordIndex % task.seedRecords.length];

    let simulated: SyntheticTraceRecord | null;
    let data: DataInfo;

    if (task.generationMode === 'rft') {
      // RFT mode: Generate varied prompts with empty output for rollout
      console.log(`[generateSingleRecord] RFT mode - generating varied prompt`);
      simulated = await generateRFTRecord(
        task.topicPath,
        seedRecord,
        task.tools,
        personaCache
      );

      if (!simulated) {
        console.log(`[generateSingleRecord] RFT generation returned empty for ${task.topicName}[${recordIndex + 1}]`);
        return { record: null, error: `${task.topicName}[${recordIndex + 1}]: RFT generation returned empty` };
      }

      console.log(`[generateSingleRecord] Building RFT data info for ${task.topicName}[${recordIndex + 1}]...`);
      console.log(`[generateSingleRecord] Simulated record has ${simulated.messages.length} messages, persona: "${simulated.persona?.substring(0, 50)}..."`);
      data = buildRFTDataInfo(simulated, task.tools);
      console.log(`[generateSingleRecord] RFT DataInfo built - input messages: ${data.input?.messages?.length}, tools: ${data.input?.tools?.length}`);
    } else {
      // SFT mode: Generate full conversation with assistant responses
      const seedMessages = extractSeedMessages(seedRecord);
      const seedSystemPrompt = extractSeedSystemPrompt(seedMessages);
      console.log(`[generateSingleRecord] SFT mode - Seed: ${seedRecord?.id || 'none'}, messages: ${seedMessages.length}, hasSystemPrompt: ${!!seedSystemPrompt}`);

      simulated = await simulateConversation(
        task.topicPath,
        seedSystemPrompt,
        seedMessages,
        task.tools,
        turns,
        personaCache
      );

      if (!simulated) {
        console.log(`[generateSingleRecord] Simulation returned empty for ${task.topicName}[${recordIndex + 1}]`);
        return { record: null, error: `${task.topicName}[${recordIndex + 1}]: simulation returned empty` };
      }

      console.log(`[generateSingleRecord] Building SFT data info for ${task.topicName}[${recordIndex + 1}]...`);
      data = buildSyntheticTraceDataInfo(simulated, task.tools);
    }

    const recordData = {
      data,
      metadata: {
        persona: simulated.persona,
        seed_record_id: seedRecord?.id,
        seed_topic_path: task.topicPath,
        generated_at_ms: Date.now(),
      },
      topic: task.topicId, // Use topic ID (not name) for consistent lookup in UI
      is_generated: true,
      evaluation: undefined,
    };

    // Add record to DB immediately for real-time UI update
    try {
      console.log(`[generateSingleRecord] Preparing to save record ${recordIndex + 1} to DB for topic "${task.topicName}"`);
      console.log(`[generateSingleRecord] Record structure: { topic: "${recordData.topic}", is_generated: ${recordData.is_generated}, has_data: ${!!recordData.data} }`);
      console.log(`[generateSingleRecord] Data structure: { has_input: ${!!recordData.data?.input}, has_output: ${!!recordData.data?.output} }`);
      console.log(`[generateSingleRecord] Input: { messages: ${recordData.data?.input?.messages?.length || 0}, tools: ${recordData.data?.input?.tools?.length || 0} }`);
      console.log(`[generateSingleRecord] Calling datasetsDB.addRecordsToDataset(${callbacks.datasetId}, [...])...`);

      const addedRecords = await datasetsDB.addRecordsToDataset(callbacks.datasetId, [recordData]);
      console.log(`[generateSingleRecord] DB call returned: ${addedRecords.length} records added`);

      // Update shared progress counter atomically
      callbacks.progressCounter.count += addedRecords.length;
      console.log(`[generateSingleRecord] Record ${recordIndex + 1} saved! Progress: ${callbacks.progressCounter.count}/${callbacks.totalExpectedRecords}`);

      if (addedRecords.length === 0) {
        console.warn(`[generateSingleRecord] WARNING: DB returned empty array - record may not have been saved!`);
      }

      // Notify UI with newly created record
      if (callbacks.on_records_added && addedRecords.length > 0) {
        await callbacks.on_records_added(addedRecords);
      }

      // Report progress after each record
      if (callbacks.on_progress) {
        await callbacks.on_progress({
          completed: callbacks.progressCounter.count,
          total: callbacks.totalExpectedRecords
        });
      }

      return { record: recordData };
    } catch (dbErr) {
      console.error(`[generateSingleRecord] DB add failed for ${task.topicName}[${recordIndex + 1}]:`, dbErr);
      return { record: null, error: `${task.topicName}[${recordIndex + 1}]: DB add failed - ${dbErr instanceof Error ? dbErr.message : String(dbErr)}` };
    }
  } catch (err) {
    console.error(`[generateSingleRecord] Error for ${task.topicName}[${recordIndex + 1}]:`, err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { record: null, error: `${task.topicName}[${recordIndex + 1}]: ${errorMsg}` };
  }
}

/** Number of records to generate in parallel within each topic */
const RECORDS_BATCH_SIZE = 10;

/**
 * Generate multiple records for a single topic
 * Generates records in batches to avoid overwhelming the queue
 */
async function generateRecordsForTopic(
  task: TopicGenerationTask,
  turns: number,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<TopicGenerationResult> {
  console.log(`[generateRecordsForTopic] Starting topic "${task.topicName}" - generating ${task.recordsToGenerate} records in batches of ${RECORDS_BATCH_SIZE}`);

  const records: TopicGenerationResult['records'] = [];
  const errors: string[] = [];

  // Generate records in batches to avoid overwhelming the queue
  for (let batchStart = 0; batchStart < task.recordsToGenerate; batchStart += RECORDS_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + RECORDS_BATCH_SIZE, task.recordsToGenerate);
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);

    console.log(`[generateRecordsForTopic] Topic "${task.topicName}" - processing records ${batchStart + 1}-${batchEnd}`);

    const batchPromises = batchIndices.map(i =>
      generateSingleRecord(task, i, turns, personaCache, callbacks)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        if (result.value.record) {
          records.push(result.value.record);
        }
        if (result.value.error) {
          errors.push(result.value.error);
        }
      } else {
        errors.push(`${task.topicName}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    }
  }

  console.log(`[generateRecordsForTopic] Completed topic "${task.topicName}" - ${records.length} records, ${errors.length} errors`);
  return { topicName: task.topicName, records, errors };
}

/**
 * Main trace generation function
 */
export async function generateTraces(params: GenerateTracesParams): Promise<GenerateTracesResult> {
  try {
    const { dataset_id, record_ids, count, max_turns, concurrency, target_topics, selected_topics, on_progress, on_records_added, generation_mode = 'rft' } =
      params;

    const resolvedDatasetId = dataset_id;
    if (!resolvedDatasetId) {
      return { success: false, error: 'dataset_id is required' };
    }

    const dataset = await datasetsDB.getDatasetById(resolvedDatasetId);
    if (!dataset) {
      return { success: false, error: `Dataset ${resolvedDatasetId} not found` };
    }
    const topicHierarchy = dataset.topicHierarchy;

    const selectedIds = (record_ids || []).filter(Boolean) as string[];
    // Fetch seed records if IDs provided, otherwise use undefined as placeholder
    const selectedRecords = selectedIds.length > 0
      ? await datasetsDB.getRecordsByDatasetId(resolvedDatasetId, selectedIds)
      : [];
    const seedRecords = selectedRecords.length > 0 ? selectedRecords : [undefined];

    // Build target topics list based on target_topics setting
    // Extract leaf topics from hierarchy with full paths
    const hierarchyLeafTopics = topicHierarchy?.hierarchy && topicHierarchy.hierarchy.length > 0
      ? extractLeafTopicsFromHierarchy(topicHierarchy.hierarchy)
      : [];

    let targetLeafTopics: LeafTopic[] = [];
    if (target_topics === 'selected' && selected_topics && selected_topics.length > 0) {
      // Find the full paths for selected topics from hierarchy
      // Match by ID first (from coverage analysis), fallback to name
      targetLeafTopics = selected_topics
        .map(topicIdOrName =>
          hierarchyLeafTopics.find(t => t.id === topicIdOrName) ||
          hierarchyLeafTopics.find(t => t.name === topicIdOrName)
        )
        .filter((t): t is LeafTopic => t !== undefined);
    } else {
      targetLeafTopics = hierarchyLeafTopics;
    }

    // Check if we're in "seed-based" mode (no hierarchy, but have seed records)
    const isSeedBasedMode = targetLeafTopics.length === 0 && seedRecords.some(r => r !== undefined);

    if (targetLeafTopics.length === 0 && !isSeedBasedMode) {
      console.log('[generateTraces] Error: No topics and no seed records');
      return {
        success: false,
        error: 'No topics found and no seed records provided. Either configure a topic hierarchy or provide record_ids to generate variations from.',
      };
    }

    // In seed-based mode, create virtual "topics" from seed records
    if (isSeedBasedMode) {
      console.log('[generateTraces] Seed-based mode: generating variations from seed records without topic hierarchy');
      // Create a virtual topic for each unique seed record topic (or "uncategorized")
      const seedTopicMap = new Map<string, LeafTopic>();
      for (const record of seedRecords) {
        if (!record) continue;
        const topic = record.topic;
        if (topic && !seedTopicMap.has(topic)) {
          seedTopicMap.set(topic, {
            id: topic,
            name: topic,
            path: [topic],
          });
        }
      }
      targetLeafTopics = Array.from(seedTopicMap.values());
    }

    const recordsPerTopic = typeof count === 'number' && count > 0 ? count : DEFAULT_RECORDS_PER_TOPIC;
    const totalExpectedRecords = targetLeafTopics.length * recordsPerTopic;

    const turns = typeof max_turns === 'number' ? max_turns : DEFAULT_MAX_TURNS;
    const effectiveConcurrency = typeof concurrency === 'number' && concurrency > 0
      ? Math.min(concurrency, 10)
      : DEFAULT_CONCURRENCY;

    // Set LLM concurrency limiter - this controls total concurrent LLM requests
    setLLMConcurrency(effectiveConcurrency);

    // Extract tools from seed records (use first available or fallback to catalog)
    const seedTools = seedRecords.find(r => r !== undefined) ? extractSeedTools(seedRecords.find(r => r !== undefined)) : [];
    const effectiveTools = seedTools.length > 0
      ? seedTools
      : [];

    // Create one task per topic with full path and ID
    const topicTasks: TopicGenerationTask[] = targetLeafTopics.map(topic => {
      // In seed-based mode, filter seed records to those matching this topic
      let taskSeedRecords: (DatasetRecord | undefined)[] = seedRecords;
      if (isSeedBasedMode) {
        const filtered = seedRecords.filter((r): r is DatasetRecord => {
          if (!r) return false;
          const recordTopic = r.topic || '__uncategorized__';
          return recordTopic === topic.id;
        });
        // Ensure we have at least one seed record (fallback to all if filter is empty)
        if (filtered.length > 0) {
          taskSeedRecords = filtered;
        } else {
          taskSeedRecords = seedRecords.filter((r): r is DatasetRecord => r !== undefined);
        }
      }

      return {
        topicId: topic.id,
        topicName: topic.name,
        topicPath: topic.path,
        recordsToGenerate: recordsPerTopic,
        seedRecords: taskSeedRecords,
        tools: effectiveTools,
        generationMode: generation_mode,
      };
    });
    const personaCache = new Map<string, string[]>();
    const allErrors: string[] = [];

    // Shared progress counter for real-time tracking across parallel topics
    const progressCounter = { count: 0 };

    // Callbacks object shared by all parallel tasks
    const callbacks: GenerationCallbacks = {
      datasetId: resolvedDatasetId,
      totalExpectedRecords,
      progressCounter,
      on_progress,
      on_records_added,
    };

    // Process topics in batches to avoid overwhelming the queue
    // The semaphore limits concurrent LLM requests, but creating too many promises at once
    // causes memory pressure and excessive queue buildup
    const topicBatchSize = DEFAULT_BATCH_SIZE;

    // Process topics in batches
    for (let batchStart = 0; batchStart < topicTasks.length; batchStart += topicBatchSize) {
      const batchEnd = Math.min(batchStart + topicBatchSize, topicTasks.length);
      const batchTasks = topicTasks.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / topicBatchSize) + 1;
      const totalBatches = Math.ceil(topicTasks.length / topicBatchSize);

      console.log(`[generateTraces] Starting batch ${batchNumber}/${totalBatches} (topics ${batchStart + 1}-${batchEnd})`);

      // Run this batch of topic tasks in parallel
      const batchResults = await Promise.allSettled(
        batchTasks.map(task => generateRecordsForTopic(task, turns, personaCache, callbacks))
      );

      // Collect errors from this batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const task = batchTasks[j];

        if (result.status === 'fulfilled') {
          allErrors.push(...result.value.errors);
        } else {
          const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[generateTraces] Topic "${task.topicName}" failed:`, errorMsg);
          allErrors.push(`${task.topicName}: ${errorMsg}`);
        }
      }

      console.log(`[generateTraces] Batch ${batchNumber}/${totalBatches} complete. Progress: ${progressCounter.count}/${totalExpectedRecords}`);
    }

    const createdTotal = progressCounter.count;

    console.log('[generateTraces] ========== GENERATION COMPLETE ==========');
    console.log('[generateTraces] Summary:', {
      totalCreated: createdTotal,
      totalExpected: totalExpectedRecords,
      errorCount: allErrors.length,
    });

    if (allErrors.length > 0) {
      console.log('[generateTraces] Errors encountered:');
      allErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    if (createdTotal === 0) {
      console.log('[generateTraces] No traces generated - returning failure');
      return {
        success: false,
        dataset_name: dataset.name,
        error: allErrors.length > 0 ? allErrors.join(' | ') : 'No traces were generated',
      };
    }

    console.log('[generateTraces] Success!');
    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdTotal,
      error: allErrors.length > 0 ? `${allErrors.length} error(s): ${allErrors.slice(0, 5).join(' | ')}${allErrors.length > 5 ? '...' : ''}` : undefined,
    };
  } catch (error) {
    console.error('[generateTraces] Fatal error:', error);
    return { success: false, error: `LLM error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export const generateTracesHandler: ToolHandler = async (input) => {
  return generateTraces(input as GenerateTracesParams);
};

export const generateTracesTool: DistriFnTool = {
  name: 'generate_traces',
  description: `Generate synthetic trace records and add them to a dataset.

Supports two workflows:
1. **Data-First**: Provide record_ids to generate variations from existing records (no topic hierarchy needed). Generated records inherit seed's topic or remain uncategorized for later classification.
2. **Topics-First**: Configure topic hierarchy first, then generate data for specific topics to fill coverage gaps.

Generation modes:
- **RFT** (default): Varied prompts with empty output for reinforcement learning rollouts
- **SFT**: Complete multi-turn conversations with assistant responses for supervised fine-tuning`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Seed records to generate variations from. In Data-First workflow, this enables generation without a topic hierarchy.',
      },
      count: { type: 'number', description: 'Number of records to generate per topic/seed group (default 5).' },
      max_turns: { type: 'number', description: 'Max user turns per trace (default 3, only used in SFT mode)' },
      generation_mode: {
        type: 'string',
        enum: ['rft', 'sft'],
        description: 'Generation mode: "rft" (default) generates varied prompts with empty output for reinforcement learning rollouts; "sft" generates complete multi-turn conversations with assistant responses for supervised fine-tuning',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input: object) => JSON.stringify(await generateTracesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
