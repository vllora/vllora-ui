/**
 * Generate Traces - Main Entry Point
 *
 * Generates synthetic training examples and adds them to a dataset.
 * Each example includes user_message + assistant_response + expected_score.
 * Output DataInfo has empty output (rollout handled during training).
 */

import type { DistriFnTool } from "@distri/core";
import { datasetService, recordService } from "@/services/service-registry";
import type { DatasetRecord } from "@/types/dataset-types";
import type { ToolHandler } from "../../types";

// Import types
import type {
  GenerateTracesParams,
  GenerateTracesResult,
  TopicGenerationTask,
  TopicGenerationResult,
  GenerationCallbacks,
  LeafTopic,
} from "./types";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_RECORDS_PER_TOPIC,
  DEFAULT_BATCH_SIZE,
} from "./types";

// Import utilities
import { setLLMConcurrency } from "./llm";
import {
  extractLeafTopicsFromHierarchy,
  extractSeedTools,
} from "./utils";

// Import generators
import { buildTraceDataInfo, generateBatchRFTRecords } from "./rft-generator";

// Import chunk resolution utilities
import { resolveChunkRefs, buildChunkContextSection } from "@/lib/distri-finetune-tools/steps/shared/chunk-lookup";
import { resolveTopicSystemPrompt, buildGenericSystemPrompt } from "@/lib/distri-finetune-tools/steps/shared/topic-system-prompt";

// Re-export types for external use
export type { GenerateTracesParams, GenerateTracesResult } from "./types";



/**
 * Generate multiple RFT records for a single topic using batch LLM call.
 *
 * Instead of making N individual LLM calls (one per record), this generates
 * all N user messages in a single structured JSON call. All records under a
 * topic share the same system prompt, so only user messages need to vary.
 *
 * ~5× fewer LLM calls compared to the per-record approach.
 */
async function generateRFTRecordsForTopic(
  task: TopicGenerationTask,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks,
): Promise<TopicGenerationResult> {
  console.log(
    `[generateRFTRecordsForTopic] Starting batch RFT for topic "${task.topicName}" - ${task.recordsToGenerate} records in 1 LLM call`,
  );

  const records: TopicGenerationResult["records"] = [];
  const errors: string[] = [];

  try {
    const seedRecord = task.seedRecords[0];

    // Single LLM call to generate all user messages for this topic
    const syntheticRecords = await generateBatchRFTRecords(
      task.topicPath,
      seedRecord,
      task.tools,
      personaCache,
      task.recordsToGenerate,
      task.knowledgeContext,
      task.topicSystemPrompt,
    );

    if (syntheticRecords.length === 0) {
      const errMsg = `${task.topicName}: Batch RFT generation returned no records`;
      console.warn(`[generateRFTRecordsForTopic] ${errMsg}`);
      errors.push(errMsg);
      return { topicName: task.topicName, records, errors };
    }

    console.log(
      `[generateRFTRecordsForTopic] Got ${syntheticRecords.length} records from batch LLM call, saving to DB...`,
    );

    // Build record data for all generated records
    const allRecordData = syntheticRecords.map((simulated) => ({
      data: buildTraceDataInfo(simulated, task.tools),
      metadata: {
        persona: simulated.persona,
        seed_record_id: seedRecord?.id,
        seed_topic_path: task.topicPath,
        generated_at_ms: Date.now(),
        sourceChunkRefs: task.sourceChunkRefs || [],
        skillResponse: simulated.skillResponse,
        baseScore: simulated.baseScore,
      },
      topic: task.topicId,
      is_generated: true,
      evaluation: undefined,
    }));

    // Save all records to DB in one batch write
    try {
      const addedRecords = await recordService.add(
        callbacks.workflowId,
        allRecordData,
      );

      console.log(
        `[generateRFTRecordsForTopic] DB saved ${addedRecords.length} records for topic "${task.topicName}"`,
      );

      // Update shared progress counter atomically
      callbacks.progressCounter.count += addedRecords.length;

      // Collect records for result
      for (const recordData of allRecordData) {
        records.push(recordData);
      }

      // Notify UI with all newly created records
      if (callbacks.on_records_added && addedRecords.length > 0) {
        await callbacks.on_records_added(addedRecords);
      }

      // Report progress
      if (callbacks.on_progress) {
        await callbacks.on_progress({
          completed: callbacks.progressCounter.count,
          total: callbacks.totalExpectedRecords,
        });
      }
    } catch (dbErr) {
      const errMsg = `${task.topicName}: DB batch save failed - ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`;
      console.error(`[generateRFTRecordsForTopic] ${errMsg}`);
      errors.push(errMsg);
    }
  } catch (err) {
    const errMsg = `${task.topicName}: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[generateRFTRecordsForTopic] Error:`, err);
    errors.push(errMsg);
  }

  console.log(
    `[generateRFTRecordsForTopic] Completed topic "${task.topicName}" - ${records.length} records, ${errors.length} errors`,
  );
  return { topicName: task.topicName, records, errors };
}

/**
 * Generate multiple records for a single topic.
 * Uses batch generation (1 LLM call per topic).
 */
async function generateRecordsForTopic(
  task: TopicGenerationTask,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks,
): Promise<TopicGenerationResult> {
  return generateRFTRecordsForTopic(task, personaCache, callbacks);
}

/**
 * Main trace generation function
 */
export async function generateTraces(
  params: GenerateTracesParams,
): Promise<GenerateTracesResult> {
  try {
    const {
      workflow_id,
      record_ids,
      count,
      concurrency,
      target_topics,
      selected_topics,
      on_progress,
      on_records_added,
    } = params;

    const resolvedDatasetId = workflow_id;
    if (!resolvedDatasetId) {
      return { success: false, error: "workflow_id is required" };
    }

    const dataset = await datasetService.getById(resolvedDatasetId);
    if (!dataset) {
      return {
        success: false,
        error: `Dataset ${resolvedDatasetId} not found`,
      };
    }
    const topicHierarchy = dataset.topicHierarchy;

    const selectedIds = (record_ids || []).filter(Boolean) as string[];
    // Fetch seed records if IDs provided, otherwise use undefined as placeholder
    const selectedRecords =
      selectedIds.length > 0
        ? await recordService.getByDatasetId(resolvedDatasetId, selectedIds)
        : [];
    const seedRecords =
      selectedRecords.length > 0 ? selectedRecords : [undefined];

    // Build target topics list based on target_topics setting
    // Extract leaf topics from hierarchy with full paths
    const hierarchyLeafTopics =
      topicHierarchy?.hierarchy && topicHierarchy.hierarchy.length > 0
        ? extractLeafTopicsFromHierarchy(topicHierarchy.hierarchy)
        : [];

    console.log("[generateTraces] hierarchyLeafTopics:", hierarchyLeafTopics);
    let targetLeafTopics: LeafTopic[] = [];
    if (
      target_topics === "selected" &&
      selected_topics &&
      selected_topics.length > 0
    ) {
      // Find the full paths for selected topics from hierarchy
      // Match by ID first (from coverage analysis), fallback to name
      selected_topics.forEach(t => {
        let matching = hierarchyLeafTopics.filter(leaf => {
          if(t.includes('/')) {
            return leaf.path.join('/') === t || leaf.path.join('/').startsWith(t + '/');
          }
          return t === leaf.name || t === leaf.id || t === leaf.path.join('/') || leaf.path.includes(t);
        })
        targetLeafTopics.push(...matching);
        targetLeafTopics = [...new Set(targetLeafTopics)];
      })
    } else {
      targetLeafTopics = hierarchyLeafTopics;
    }

    // Check if we're in "seed-based" mode (no hierarchy, but have seed records)
    const isSeedBasedMode =
      targetLeafTopics.length === 0 && seedRecords.some((r) => r !== undefined);

    if (targetLeafTopics.length === 0 && !isSeedBasedMode) {
      console.log("[generateTraces] Error: No topics and no seed records");
      return {
        success: false,
        error:
          "No topics found and no seed records provided. Either configure a topic hierarchy or provide record_ids to generate variations from.",
      };
    }

    // In seed-based mode, create virtual "topics" from seed records
    if (isSeedBasedMode) {
      console.log(
        "[generateTraces] Seed-based mode: generating variations from seed records without topic hierarchy",
      );
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

    const recordsPerTopic =
      typeof count === "number" && count > 0
        ? count
        : DEFAULT_RECORDS_PER_TOPIC;
    const totalExpectedRecords = targetLeafTopics.length * recordsPerTopic;

    const effectiveConcurrency =
      typeof concurrency === "number" && concurrency > 0
        ? Math.min(concurrency, 10)
        : DEFAULT_CONCURRENCY;

    // Set LLM concurrency limiter - this controls total concurrent LLM requests
    setLLMConcurrency(effectiveConcurrency);

    // Extract tools from seed records (use first available or fallback to catalog)
    const seedTools = seedRecords.find((r) => r !== undefined)
      ? extractSeedTools(seedRecords.find((r) => r !== undefined))
      : [];
    const effectiveTools = seedTools.length > 0 ? seedTools : [];

    // Resolve knowledge source chunks for topics that have sourceChunkRefs
    const topicKnowledgeContexts = new Map<string, string>();
    for (const topic of targetLeafTopics) {
      if (topic.sourceChunkRefs?.length) {
        try {
          const resolvedChunks = await resolveChunkRefs(resolvedDatasetId, topic.sourceChunkRefs);
          if (resolvedChunks.length > 0) {
            topicKnowledgeContexts.set(topic.id, buildChunkContextSection(resolvedChunks));
            console.log(`[generateTraces] Resolved ${resolvedChunks.length} chunks for topic "${topic.name}"`);
          }
        } catch (err) {
          console.warn(`[generateTraces] Failed to resolve chunks for topic "${topic.name}":`, err);
        }
      }
    }

    // Pre-compute shared system prompts for each topic
    const trainingObjective = dataset.datasetObjective || '';
    const normalizedRole = dataset.normalizedObjective;
    const topicSystemPromptMap = new Map<string, string>();
    for (const topic of targetLeafTopics) {
      if (trainingObjective) {
        topicSystemPromptMap.set(topic.id, resolveTopicSystemPrompt(topic.path, trainingObjective, undefined, topic.promptTemplate, normalizedRole, topic.normalizedSegments));
      } else {
        topicSystemPromptMap.set(topic.id, buildGenericSystemPrompt(topic.path.join(' > ')));
      }
    }

    // Create one task per topic with full path and ID
    const topicTasks: TopicGenerationTask[] = targetLeafTopics.map((topic) => {
      // In seed-based mode, filter seed records to those matching this topic
      let taskSeedRecords: (DatasetRecord | undefined)[] = seedRecords;
      if (isSeedBasedMode) {
        const filtered = seedRecords.filter((r): r is DatasetRecord => {
          if (!r) return false;
          const recordTopic = r.topic || "__uncategorized__";
          return recordTopic === topic.id;
        });
        // Ensure we have at least one seed record (fallback to all if filter is empty)
        if (filtered.length > 0) {
          taskSeedRecords = filtered;
        } else {
          taskSeedRecords = seedRecords.filter(
            (r): r is DatasetRecord => r !== undefined,
          );
        }
      }

      return {
        topicId: topic.id,
        topicName: topic.name,
        topicPath: topic.path,
        recordsToGenerate: recordsPerTopic,
        seedRecords: taskSeedRecords,
        tools: effectiveTools,
        knowledgeContext: topicKnowledgeContexts.get(topic.id),
        sourceChunkRefs: topic.sourceChunkRefs,
        topicSystemPrompt: topicSystemPromptMap.get(topic.id),
      };
    });
    const personaCache = new Map<string, string[]>();
    const allErrors: string[] = [];

    // Shared progress counter for real-time tracking across parallel topics
    const progressCounter = { count: 0 };

    // Callbacks object shared by all parallel tasks
    const callbacks: GenerationCallbacks = {
      workflowId: resolvedDatasetId,
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
    for (
      let batchStart = 0;
      batchStart < topicTasks.length;
      batchStart += topicBatchSize
    ) {
      const batchEnd = Math.min(batchStart + topicBatchSize, topicTasks.length);
      const batchTasks = topicTasks.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / topicBatchSize) + 1;
      const totalBatches = Math.ceil(topicTasks.length / topicBatchSize);

      console.log(
        `[generateTraces] Starting batch ${batchNumber}/${totalBatches} (topics ${batchStart + 1}-${batchEnd})`,
      );

      // Run this batch of topic tasks in parallel
      const batchResults = await Promise.allSettled(
        batchTasks.map((task) =>
          generateRecordsForTopic(task, personaCache, callbacks),
        ),
      );

      // Collect errors from this batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const task = batchTasks[j];

        if (result.status === "fulfilled") {
          allErrors.push(...result.value.errors);
        } else {
          const errorMsg =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          console.error(
            `[generateTraces] Topic "${task.topicName}" failed:`,
            errorMsg,
          );
          allErrors.push(`${task.topicName}: ${errorMsg}`);
        }
      }

      console.log(
        `[generateTraces] Batch ${batchNumber}/${totalBatches} complete. Progress: ${progressCounter.count}/${totalExpectedRecords}`,
      );
    }

    const createdTotal = progressCounter.count;

    console.log("[generateTraces] ========== GENERATION COMPLETE ==========");
    console.log("[generateTraces] Summary:", {
      totalCreated: createdTotal,
      totalExpected: totalExpectedRecords,
      errorCount: allErrors.length,
    });

    if (allErrors.length > 0) {
      console.log("[generateTraces] Errors encountered:");
      allErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    if (createdTotal === 0) {
      console.log("[generateTraces] No traces generated - returning failure");
      return {
        success: false,
        dataset_name: dataset.name,
        error:
          allErrors.length > 0
            ? allErrors.join(" | ")
            : "No traces were generated",
      };
    }

    console.log("[generateTraces] Success!");
    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdTotal,
      error:
        allErrors.length > 0
          ? `${allErrors.length} error(s): ${allErrors.slice(0, 5).join(" | ")}${allErrors.length > 5 ? "..." : ""}`
          : undefined,
    };
  } catch (error) {
    console.error("[generateTraces] Fatal error:", error);
    return {
      success: false,
      error: `LLM error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export const generateTracesHandler: ToolHandler = async (input) => {
  return generateTraces(input as GenerateTracesParams);
};

export const generateTracesTool: DistriFnTool = {
  name: "generate_traces",
  description: `Generate synthetic training examples and add them to a dataset.

Each example includes user_message + assistant_response + expected_score.
Output DataInfo has empty output (rollout handled during training).
The assistant response and quality score are stored in record metadata (skillResponse, baseScore).

Supports two workflows:
1. **Data-First**: Provide record_ids to generate variations from existing records (no topic hierarchy needed).
2. **Topics-First**: Configure topic hierarchy first, then generate data for specific topics to fill coverage gaps.`,
  type: "function",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string", description: "The dataset ID" },
      record_ids: {
        type: "array",
        items: { type: "string" },
        description:
          "Seed records to generate variations from. In Data-First workflow, this enables generation without a topic hierarchy.",
      },
      count: {
        type: "number",
        description:
          "Number of records to generate per topic/seed group (default 5).",
      },
    },
    required: ["workflow_id"],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(
      await generateTracesHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
