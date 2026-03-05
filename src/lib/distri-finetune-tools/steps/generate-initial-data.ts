/**
 * Generate Initial Data Tool
 *
 * Generates initial seed records for empty datasets using the training objective
 * and optionally uploaded knowledge sources (PDFs, documents) for grounded generation.
 */

import type { DistriFnTool } from "@distri/core";
import * as datasetsDB from "@/services/datasets-db";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import type { ToolHandler } from "../types";
import type { DataInfo, TopicHierarchyNode } from "@/types/dataset-types";
import * as workflowDB from "@/services/finetune-workflow-db";
import { emitter } from "@/utils/eventEmitter";
import {
  callLucy,
  type LucyMessage,
  type ContentBlock,
  type FileContentBlock,
} from "./shared/lucy-client";
import { buildContentBlocksFromSources } from "./shared/knowledge-context";
import { resolveChunkRefs, buildChunkContextSection, normalizeChunkRef, buildReadySourceMap } from "./shared/chunk-lookup";
import { resolveTopicSystemPrompt, buildGenericSystemPrompt } from "./shared/topic-system-prompt";
import { extractSeedTools, extractSeedMessages, extractSeedSystemPrompt } from "@/lib/distri-dataset-tools/analysis/generate-traces/utils";

// =============================================================================
// Topic Hierarchy Helpers
// =============================================================================

interface LeafTopic {
  name: string;
  path: string[]; // Full path from root to leaf
  sourceChunkRefs?: string[];
  promptTemplate?: string;
  normalizedSegments?: (string | undefined)[];
}

/**
 * Extract all leaf topics from a hierarchy tree.
 * A leaf topic is one with no children or empty children array.
 */
function getLeafTopics(
  hierarchy: TopicHierarchyNode[],
  parentPath: string[] = [],
  parentSegments: (string | undefined)[] = [],
): LeafTopic[] {
  const leaves: LeafTopic[] = [];

  for (const node of hierarchy) {
    const currentPath = [...parentPath, node.name];
    const currentSegments = [...parentSegments, node.normalizedPromptSegment];

    if (!node.children || node.children.length === 0) {
      // This is a leaf node
      leaves.push({
        name: node.name,
        path: currentPath,
        sourceChunkRefs: node.sourceChunkRefs,
        promptTemplate: node.promptTemplate,
        normalizedSegments: currentSegments,
      });
    } else {
      // Recurse into children
      leaves.push(...getLeafTopics(node.children, currentPath, currentSegments));
    }
  }

  return leaves;
}

/**
 * Distribute a count across topics as evenly as possible.
 * Returns a map of topic name -> count to generate.
 */
function distributeCountAcrossTopics(totalCount: number, topics: LeafTopic[]): Map<LeafTopic, number> {
  const distribution = new Map<LeafTopic, number>();

  if (topics.length === 0) return distribution;

  const baseCount = Math.floor(totalCount / topics.length);
  let remainder = totalCount % topics.length;

  for (const topic of topics) {
    const count = baseCount + (remainder > 0 ? 1 : 0);
    if (count > 0) {
      distribution.set(topic, count);
    }
    if (remainder > 0) remainder--;
  }

  return distribution;
}

// Batch size for generation - smaller batches are faster and more reliable
const BATCH_SIZE = 10;

// Number of parallel requests to make — OpenAI gpt-4.1 supports 10K+ RPM
const PARALLEL_REQUESTS = 6;


// =============================================================================
// Types
// =============================================================================

interface OutputFormatParam {
  schema: Record<string, unknown>;
  system_prompt_template: string;
}

interface GenerateInitialDataParams {
  dataset_id: string;
  count?: number;
  /** Optional user guidance for how to generate the data (e.g., "focus on beginner concepts", "include edge cases") */
  user_guidance?: string;
  /** If true, distribute generation across topics in the hierarchy */
  distribute_by_topic?: boolean;
  /** Response schema for structured output tasks */
  output_format?: OutputFormatParam | null;
  /** Generate only for specific topic names (subset of hierarchy leaves) */
  target_topics?: string[];
  /** Override count per each target topic */
  per_topic_count?: number;
}

interface GeneratedExample {
  /** Optional — only present in structured output mode */
  system_prompt?: string;
  user_message: string;
  assistant_response: string;
  expected_score: number;
  /** Chunk ref IDs the LLM drew on for this example (e.g. "sourceId:chunkId") */
  used_sources?: string[];
}

interface KnowledgeContext {
  hasKnowledge: boolean;
  sourceCount: number;
  sourceNames: string[];
  combinedText: string;
  topics: string[];
  sections: Array<{ title: string; content: string }>;
}

interface GenerateInitialDataResult {
  success: boolean;
  error?: string;
  dataset_name?: string;
  records_created?: number;
  training_objective?: string;
  knowledge_sources_used?: number;
}

// =============================================================================
// Knowledge Source Fetching
// =============================================================================

/**
 * Build knowledge context from pre-fetched sources (no IndexedDB call).
 */
function buildKnowledgeContextFromArray(
  allSources: readonly import("@/types/dataset-types").KnowledgeSource[],
): KnowledgeContext {
  const readySources = allSources.filter(
    (s) => s.status === "ready" && s.extractedContent
  );

  if (readySources.length === 0) {
    return {
      hasKnowledge: false,
      sourceCount: 0,
      sourceNames: [],
      combinedText: "",
      topics: [],
      sections: [],
    };
  }

  const sourceNames: string[] = [];
  const allTopics: string[] = [];
  const allSections: Array<{ title: string; content: string }> = [];
  const textParts: string[] = [];

  for (const source of readySources) {
    sourceNames.push(source.name);
    const extracted = source.extractedContent!;

    // Collect section headings
    if (extracted.sectionHeadings) {
      allTopics.push(...extracted.sectionHeadings);
    }

    // Collect sections (limit content length per section)
    if (extracted.sections) {
      for (const section of extracted.sections) {
        allSections.push({
          title: section.title,
          content: section.content.substring(0, 1000),
        });
      }
    }

    // Collect text (limit per source to avoid token overflow)
    if (extracted.text) {
      textParts.push(
        `--- From: ${source.name} ---\n${extracted.text.substring(0, 3000)}`
      );
    }
  }

  // Deduplicate topics
  const uniqueTopics = [...new Set(allTopics)];

  return {
    hasKnowledge: true,
    sourceCount: readySources.length,
    sourceNames,
    combinedText: textParts.join("\n\n"),
    topics: uniqueTopics,
    sections: allSections.slice(0, 20), // Limit sections
  };
}

/**
 * Build all chunk refs from pre-fetched knowledge sources (no IndexedDB call).
 * Used as fallback when topic-level sourceChunkRefs are empty but documents exist.
 * Returns refs in "sourceId:chunkId" format.
 */
function buildAllChunkRefsFromSources(
  allSources: readonly import("@/types/dataset-types").KnowledgeSource[],
): string[] {
  const readySources = allSources.filter(s => s.status === "ready" && s.extractedContent);
  const refs: string[] = [];

  for (const source of readySources) {
    const metadata = source.extractedContent?.metadata as Record<string, unknown> | undefined;
    const extractionMethod = metadata?.extractionMethod as string | undefined;

    if (extractionMethod === "local-semantic") {
      const chunks = (metadata?.chunks as Array<{ id: string }>) || [];
      for (const chunk of chunks) {
        refs.push(`${source.id}:${chunk.id}`);
      }
    } else {
      const sections = source.extractedContent?.sections || [];
      for (let i = 0; i < sections.length; i++) {
        refs.push(`${source.id}:section-${i}`);
      }
    }
  }

  return refs;
}

// =============================================================================
// Prompts
// =============================================================================

const INITIAL_DATA_GENERATION_SYSTEM = `You are an expert at creating high-quality training data for LLM fine-tuning.
Your task is to generate diverse, realistic conversation examples based on a training objective.

Rules:
- Generate examples that directly align with the training objective
- Each example should have a clear, specific scenario
- User messages should be natural and varied in style
- Include helpful, high-quality assistant responses for each example
- Provide an expected quality score (0.0-1.0) for each example
- Vary the complexity, length, and style across examples
- Include edge cases and challenging scenarios
- When knowledge sources are provided, GROUND your examples in that material
- Reference specific concepts, terminology, and scenarios from the knowledge sources
- When knowledge chunks have [ref:...] IDs, include the ref IDs you used in the used_sources array for each example
- Output MUST be valid JSON matching the schema`;

const DIVERSITY_GUIDELINES = `Make the user messages diverse across:
- Complexity: beginner questions to advanced scenarios
- Question type: factual, explanatory, scenario-based, comparative, how-to
- Tone: casual learner, focused student, curious beginner, professional
- Length: brief one-liners to detailed multi-sentence requests
- Specificity: broad questions to very specific sub-aspects`;

const INITIAL_DATA_GENERATION_USER = `Generate {{count}} diverse training examples for the following objective:

Training Objective:
{{objective}}
{{user_guidance}}
{{system_prompt_section}}
{{topic_context}}
{{knowledge_context}}
{{structured_output_section}}
Generate a JSON array of complete conversation examples. Each example should demonstrate the ideal assistant behavior for this objective.

For each example, provide:
- user_message: A realistic user message/query
- assistant_response: An ideal, helpful response from the assistant
- expected_score: A quality score from 0.0 to 1.0 rating how well this response aligns with the training objective (1.0 = perfect alignment)

${DIVERSITY_GUIDELINES}

Output Format:
{
  "examples": [
    {
      "user_message": "User's question or request...",
      "assistant_response": "Helpful and accurate response...",
      "expected_score": 0.85
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;

const INITIAL_DATA_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "initial_training_data",
    strict: true,
    schema: {
      type: "object",
      properties: {
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              user_message: { type: "string" },
              assistant_response: { type: "string" },
              expected_score: { type: "number" },
              used_sources: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["user_message", "assistant_response", "expected_score", "used_sources"],
            additionalProperties: false,
          },
        },
      },
      required: ["examples"],
      additionalProperties: false,
    },
  },
};

// =============================================================================
// LLM Call
// =============================================================================

function buildKnowledgeContextSection(knowledge: KnowledgeContext): string {
  if (!knowledge.hasKnowledge) {
    return "";
  }

  const parts: string[] = [
    "\n--- KNOWLEDGE SOURCES (Ground your examples in this material) ---",
    `Sources: ${knowledge.sourceNames.join(", ")}`,
  ];

  // Add topics if available
  if (knowledge.topics.length > 0) {
    parts.push(`\nKey topics from sources: ${knowledge.topics.slice(0, 15).join(", ")}`);
  }

  // Add sections if available (most structured)
  if (knowledge.sections.length > 0) {
    parts.push("\nKey sections from sources:");
    for (const section of knowledge.sections.slice(0, 10)) {
      parts.push(`\n[${section.title}]\n${section.content.substring(0, 500)}...`);
    }
  } else if (knowledge.combinedText) {
    // Fall back to raw text if no sections
    parts.push("\nContent excerpts:");
    parts.push(knowledge.combinedText.substring(0, 4000));
  }

  parts.push("\n--- END KNOWLEDGE SOURCES ---\n");
  parts.push("IMPORTANT: Generate examples that reference specific concepts, terminology, and scenarios from the knowledge sources above.");

  let result = parts.join("\n");
  console.log(" ===== [generateInitialData] Knowledge context section:\n", result);
  return result;
}

async function callLLMForInitialData(
  objective: string,
  count: number,
  userGuidance?: string,
  knowledgeContext?: KnowledgeContext,
  topicContext?: LeafTopic,
  outputFormatConfig?: OutputFormatParam | null,
  fileContentBlocks?: FileContentBlock[],
  seedSystemPrompt?: string,
  topicChunkContext?: string,
  /** Pre-built topic system prompt (shared across all records in this topic) */
  topicSystemPrompt?: string,
): Promise<GeneratedExample[]> {
  // Build user guidance section if provided
  const guidanceSection = userGuidance
    ? `\nUser's specific guidance:\n${userGuidance}\n`
    : "";

  // Build topic context section if provided
  const topicSection = topicContext
    ? `\n--- TOPIC FOCUS ---\nGenerate ALL examples specifically about this topic: "${topicContext.name}"\nTopic path: ${topicContext.path.join(" > ")}\nAll examples MUST be directly relevant to this specific topic.\n--- END TOPIC FOCUS ---\n`
    : "";

  // Build knowledge context section: prefer topic-specific chunks, fall back to generic
  const knowledgeSection = topicChunkContext
    || (knowledgeContext ? buildKnowledgeContextSection(knowledgeContext) : "");

  // Build structured output section if output format is configured
  const structuredOutputSection = outputFormatConfig
    ? `\n## STRUCTURED OUTPUT DETAILS\n\nThe model must produce structured JSON output.\n\n**Fixed System Prompt (use this for context):**\n${outputFormatConfig.system_prompt_template}\n\n**Expected Output Schema:**\n${JSON.stringify(outputFormatConfig.schema, null, 2)}\n\nThe assistant_response should be valid JSON matching the output schema above.\n`
    : "";

  // Build system prompt section: tells the LLM about the assistant role (for context)
  // but does NOT ask it to generate system prompts — those are pre-built per topic
  const effectiveSystemPrompt = seedSystemPrompt || topicSystemPrompt;
  const systemPromptSection = effectiveSystemPrompt
    ? `\n--- ASSISTANT ROLE ---\nThe assistant uses this system prompt:\n"${effectiveSystemPrompt}"\nGenerate user messages a real user would ask this assistant.\n--- END ASSISTANT ROLE ---\n`
    : "";

  const userPrompt = INITIAL_DATA_GENERATION_USER
    .replace(/\{\{count\}\}/g, String(count))
    .replace("{{objective}}", objective)
    .replace("{{user_guidance}}", guidanceSection)
    .replace("{{system_prompt_section}}", systemPromptSection)
    .replace("{{topic_context}}", topicSection)
    .replace("{{knowledge_context}}", knowledgeSection)
    .replace("{{structured_output_section}}", structuredOutputSection);

  // Build user message content: file blocks (if any) + text instruction
  let userContent: string | ContentBlock[];
  if (fileContentBlocks && fileContentBlocks.length > 0) {
    userContent = [
      ...fileContentBlocks,
      { type: "text" as const, text: userPrompt },
    ];
    console.log(`[generateInitialData] Sending ${fileContentBlocks.length} file content block(s) with data generation request`);
  } else {
    userContent = userPrompt;
  }

  const messages: LucyMessage[] = [
    { role: "system", content: INITIAL_DATA_GENERATION_SYSTEM },
    { role: "user", content: userContent },
  ];

  console.log(`[generateInitialData] LLM call for ${count} examples...`);
  const startTime = Date.now();

  const responseText = await callLucy(messages, {
    temperature: 0.7,
    max_tokens: outputFormatConfig ? 16000 : undefined,
    response_format: INITIAL_DATA_RESPONSE_SCHEMA,
    label: "generate_initial_data",
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[generateInitialData] LLM call completed in ${elapsed}s`);

  const parsed = JSON.parse(responseText.trim());
  console.log(`[generateInitialData] Parsed ${parsed.examples?.length || 0} examples from response`);
  return parsed.examples || [];
}

// =============================================================================
// Convert to DatasetRecord format
// =============================================================================

function exampleToDataInfo(
  example: GeneratedExample,
  tools: any[],
  /** The shared system prompt for this topic (always provided, never from example) */
  systemPrompt: string,
): DataInfo {
  // Output always empty — fine-tuning format (model learns through rollouts)
  return {
    input: {
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: example.user_message },
      ],
      tools,
    },
    output: {
      messages: undefined,
      finish_reason: undefined,
    },
  };
}

// =============================================================================
// Main Handler
// =============================================================================

export const generateInitialDataHandler: ToolHandler = async (
  params,
): Promise<GenerateInitialDataResult> => {
  try {
    const handlerStart = Date.now();
    console.log(
      "=== [generateInitialData] Starting with params:",
      JSON.stringify(params, null, 2),
    );

    const {
      dataset_id,
      count = 10,
      user_guidance,
      distribute_by_topic = false,
      output_format,
      target_topics,
      per_topic_count,
    } = params as unknown as GenerateInitialDataParams;

    if (!dataset_id) {
      return { success: false, error: "dataset_id is required" };
    }

    // ── Parallel setup: fetch all data in one round-trip ──
    const setupStart = Date.now();
    const [dataset, workflow, existingRecords, allKnowledgeSources] = await Promise.all([
      datasetsDB.getDatasetById(dataset_id),
      workflowDB.getWorkflowByDataset(dataset_id),
      datasetsDB.getRecordsByDatasetId(dataset_id),
      knowledgeDB.getKnowledgeSourcesByDataset(dataset_id),
    ]);

    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    if (workflow) {
      if (!workflow.currentStep || workflow.currentStep === "not_started") {
        await workflowDB.advanceToStep(workflow.id, "topics_config");
      }
    }

    // Extract tools from the first non-generated seed record (if any)
    const seedRecord = existingRecords.find(r => !r.is_generated);
    const seedTools = extractSeedTools(seedRecord);
    const seedMessages = extractSeedMessages(seedRecord);
    const seedSystemPrompt = extractSeedSystemPrompt(seedMessages) ?? undefined;

    // Get training objective and optional LLM-normalized role
    const objective = dataset.datasetObjective;
    const normalizedRole = dataset.normalizedObjective;
    if (!objective || !objective.trim()) {
      return {
        success: false,
        error:
          "Dataset has no training objective defined. Please set a training objective first.",
      };
    }

    if (user_guidance) {
      console.log(
        "[generateInitialData] User guidance:",
        user_guidance.substring(0, 100) + "...",
      );
    }

    // ── Derive knowledge context from the single fetch (no more redundant IDB calls) ──
    const knowledgeContext = buildKnowledgeContextFromArray(allKnowledgeSources);
    const sourceMap = buildReadySourceMap(allKnowledgeSources);
    const fallbackChunkRefs = knowledgeContext.hasKnowledge
      ? buildAllChunkRefsFromSources(allKnowledgeSources)
      : [];
    const knowledgeBlocks = buildContentBlocksFromSources(allKnowledgeSources);
    const firstBatchFileBlocks = knowledgeBlocks.hasFileBlocks ? knowledgeBlocks.fileBlocks : undefined;

    console.log(`[generateInitialData] Setup completed in ${Date.now() - setupStart}ms`);
    if (knowledgeContext.hasKnowledge) {
      console.log(
        "[generateInitialData] Using knowledge sources:",
        knowledgeContext.sourceNames.join(", "),
      );
      console.log(
        "[generateInitialData] Fallback chunk refs:",
        fallbackChunkRefs.length,
      );
    }

    // Check if we should use topic-based generation
    // Auto-enable distribute_by_topic when a topic hierarchy exists (unless explicitly set to false)
    const topicHierarchy = dataset.topicHierarchy?.hierarchy;
    const shouldDistributeByTopic = distribute_by_topic || (topicHierarchy && topicHierarchy.length > 0);
    const allLeafTopics = (shouldDistributeByTopic && topicHierarchy && topicHierarchy.length > 0)
      ? getLeafTopics(topicHierarchy)
      : [];

    // Filter to target topics if specified
    const leafTopics = target_topics?.length
      ? allLeafTopics.filter(t => target_topics.includes(t.name))
      : allLeafTopics;

    // If per_topic_count is set, override the total count calculation
    const effectiveCount = per_topic_count
      ? per_topic_count * leafTopics.length
      : count;

    const useTopicBasedGeneration = leafTopics.length > 0;

    let totalGenerated = 0;
    let totalBatches = 0;

    if (useTopicBasedGeneration) {
      // =========================================================================
      // Topic-based generation: distribute count across leaf topics - PARALLEL
      // Each topic's count is further batched to avoid timeouts
      // =========================================================================
      const topicDistribution = distributeCountAcrossTopics(effectiveCount, leafTopics);

      // Pre-compute a shared system prompt for each topic
      const topicSystemPrompts = new Map<string, string>();
      for (const [topic] of topicDistribution) {
        topicSystemPrompts.set(
          topic.name,
          seedSystemPrompt || resolveTopicSystemPrompt(topic.path, objective, undefined, topic.promptTemplate, normalizedRole, topic.normalizedSegments),
        );
      }

      // Build a flat list of all batch jobs
      interface BatchJob {
        topic: LeafTopic;
        topicCount: number;
        batchIndex: number;
        batchSize: number;
        globalIndex: number;
      }
      const allBatchJobs: BatchJob[] = [];
      let globalIndex = 0;

      for (const [topic, topicCount] of topicDistribution) {
        const topicBatches = Math.ceil(topicCount / BATCH_SIZE);
        let remaining = topicCount;
        for (let i = 0; i < topicBatches; i++) {
          const batchSize = Math.min(BATCH_SIZE, remaining);
          allBatchJobs.push({
            topic,
            topicCount,
            batchIndex: i,
            batchSize,
            globalIndex: globalIndex++,
          });
          remaining -= batchSize;
        }
      }

      totalBatches = allBatchJobs.length;
      console.log(`[generateInitialData] Using topic-based generation across ${leafTopics.length} leaf topics (${totalBatches} batches, ${PARALLEL_REQUESTS} parallel)`);

      // Emit started event
      emitter.emit("vllora_data_generation_progress", {
        datasetId: dataset_id,
        status: "started",
        total: count,
        completed: 0,
        currentBatch: 0,
        totalBatches,
      });

      // Pre-resolve ALL topic-specific chunk contexts (single pass before batch loop)
      const preResolveStart = Date.now();
      const topicChunkContexts = new Map<string, string>();
      for (const topic of leafTopics) {
        if (!topic.sourceChunkRefs?.length) continue;
        try {
          const resolvedChunks = await resolveChunkRefs(dataset_id, topic.sourceChunkRefs, sourceMap);
          if (resolvedChunks.length > 0) {
            topicChunkContexts.set(topic.name, buildChunkContextSection(resolvedChunks));
          }
        } catch (err) {
          console.warn(`[generateInitialData] Failed to resolve chunks for "${topic.name}":`, err);
        }
      }
      console.log(`[generateInitialData] Pre-resolved chunk contexts for ${topicChunkContexts.size} topics in ${Date.now() - preResolveStart}ms`);

      // Track per-topic progress
      const topicProgress = new Map<string, number>();
      let completedBatches = 0;

      // Process batch jobs in parallel chunks
      for (let chunkStart = 0; chunkStart < allBatchJobs.length; chunkStart += PARALLEL_REQUESTS) {
        const chunkEnd = Math.min(chunkStart + PARALLEL_REQUESTS, allBatchJobs.length);
        const chunkJobs = allBatchJobs.slice(chunkStart, chunkEnd);
        const roundIndex = Math.floor(chunkStart / PARALLEL_REQUESTS) + 1;
        const totalRounds = Math.ceil(allBatchJobs.length / PARALLEL_REQUESTS);
        const roundStart = Date.now();

        console.log(`[generateInitialData] Round ${roundIndex}/${totalRounds}: batches ${chunkStart + 1}-${chunkEnd} of ${totalBatches}`);

        // Send file content blocks only with the first chunk
        const chunkFileBlocks = chunkStart === 0 ? firstBatchFileBlocks : undefined;

        // Create parallel requests for this chunk
        const batchPromises = chunkJobs.map(job =>
          callLLMForInitialData(
            objective,
            job.batchSize,
            user_guidance,
            knowledgeContext,
            job.topic,
            output_format,
            chunkFileBlocks,
            seedSystemPrompt,
            topicChunkContexts.get(job.topic.name),
            topicSystemPrompts.get(job.topic.name),
          ).then(examples => ({ job, examples }))
            .catch(err => {
              console.error(`[generateInitialData] Topic "${job.topic.name}" batch ${job.batchIndex + 1} failed:`, err);
              return { job, examples: [] as GeneratedExample[] };
            })
        );

        // Wait for all parallel batches to complete
        const results = await Promise.all(batchPromises);
        console.log(`[generateInitialData] Round ${roundIndex}/${totalRounds} completed in ${((Date.now() - roundStart) / 1000).toFixed(1)}s`);

        // Process results: build records, count progress, then save in parallel
        const savePromises: Promise<void>[] = [];
        for (const { job, examples } of results) {
          if (examples.length === 0) {
            completedBatches++;
            continue;
          }

          totalGenerated += examples.length;

          // Update per-topic progress
          const currentTopicProgress = (topicProgress.get(job.topic.name) || 0) + examples.length;
          topicProgress.set(job.topic.name, currentTopicProgress);

          // Convert to records with topic already assigned
          const topicPrompt = topicSystemPrompts.get(job.topic.name)!;
          const topicRecords = examples.map((example) => {
            // 3-tier ref priority: per-record LLM refs > per-topic refs > fallback all
            const perRecordRefs = (example.used_sources ?? [])
              .map(normalizeChunkRef)
              .filter((r): r is string => r !== null);
            const resolvedRefs = perRecordRefs.length > 0
              ? perRecordRefs
              : (job.topic.sourceChunkRefs?.length
                  ? job.topic.sourceChunkRefs
                  : fallbackChunkRefs);
            return {
              data: exampleToDataInfo(example, seedTools, topicPrompt),
              is_generated: true,
              topic: job.topic.name,
              metadata: {
                generation_source: "initial_data",
                generated_at_ms: Date.now(),
                topic_path: job.topic.path.join(" > "),
                skillResponse: example.assistant_response,
                baseScore: example.expected_score,
                sourceChunkRefs: resolvedRefs,
              },
            };
          });

          const batchJob = job;
          const batchTopicProgress = currentTopicProgress;
          savePromises.push(
            datasetsDB.addRecordsToDataset(dataset_id, topicRecords).then(addedRecords => {
              console.log(`[generateInitialData] Topic "${batchJob.topic.name}" batch ${batchJob.batchIndex + 1}: added ${addedRecords.length} records (topic: ${batchTopicProgress}, total: ${totalGenerated})`);
            }),
          );
          completedBatches++;
        }

        // Save all batch results in parallel, then refresh UI once
        await Promise.all(savePromises);
        emitter.emit("vllora_dataset_refresh" as any);

        // Emit progress event after each parallel chunk
        emitter.emit("vllora_data_generation_progress", {
          datasetId: dataset_id,
          status: "progress",
          total: count,
          completed: totalGenerated,
          currentBatch: completedBatches,
          totalBatches,
        });
      }
    } else {
      // =========================================================================
      // Standard batch generation (no topic hierarchy) - PARALLEL
      // =========================================================================
      totalBatches = Math.ceil(count / BATCH_SIZE);

      // Pre-compute a generic system prompt (shared across all records)
      const genericSystemPrompt = seedSystemPrompt || buildGenericSystemPrompt(objective, normalizedRole);

      // Emit started event
      emitter.emit("vllora_data_generation_progress", {
        datasetId: dataset_id,
        status: "started",
        total: count,
        completed: 0,
        currentBatch: 0,
        totalBatches,
      });

      console.log(`[generateInitialData] Generating ${count} examples in ${totalBatches} batches of ${BATCH_SIZE} (${PARALLEL_REQUESTS} parallel)`);

      // Process batches in parallel chunks
      let completedBatches = 0;
      for (let chunkStart = 0; chunkStart < totalBatches; chunkStart += PARALLEL_REQUESTS) {
        const chunkEnd = Math.min(chunkStart + PARALLEL_REQUESTS, totalBatches);
        const batchPromises: Promise<{ batchIndex: number; examples: GeneratedExample[] }>[] = [];

        // Send file content blocks only with the first chunk
        const chunkFileBlocks = chunkStart === 0 ? firstBatchFileBlocks : undefined;

        // Create parallel batch requests
        for (let batchIndex = chunkStart; batchIndex < chunkEnd; batchIndex++) {
          const batchStartCount = batchIndex * BATCH_SIZE;
          const remaining = count - batchStartCount;
          const batchSize = Math.min(BATCH_SIZE, remaining);

          console.log(`[generateInitialData] Queuing batch ${batchIndex + 1}/${totalBatches} (${batchSize} examples)`);

          batchPromises.push(
            callLLMForInitialData(
              objective,
              batchSize,
              user_guidance,
              knowledgeContext,
              undefined,
              output_format,
              chunkFileBlocks,
              seedSystemPrompt,
              undefined,
              genericSystemPrompt,
            ).then(examples => ({ batchIndex, examples }))
              .catch(err => {
                console.error(`[generateInitialData] Batch ${batchIndex + 1} failed:`, err);
                return { batchIndex, examples: [] as GeneratedExample[] };
              })
          );
        }

        // Wait for all parallel batches to complete
        const results = await Promise.all(batchPromises);

        // Process results: build records, then save in parallel
        const standardSavePromises: Promise<void>[] = [];
        for (const { batchIndex, examples } of results) {
          if (examples.length === 0) continue;

          totalGenerated += examples.length;

          const batchRecords = examples.map((example) => {
            const perRecordRefs = (example.used_sources ?? [])
              .map(normalizeChunkRef)
              .filter((r): r is string => r !== null);
            return {
              data: exampleToDataInfo(example, seedTools, genericSystemPrompt),
              is_generated: true,
              metadata: {
                generation_source: "initial_data",
                generated_at_ms: Date.now(),
                batch_index: batchIndex,
                skillResponse: example.assistant_response,
                baseScore: example.expected_score,
                sourceChunkRefs: perRecordRefs.length > 0
                  ? perRecordRefs
                  : fallbackChunkRefs,
              },
            };
          });

          const idx = batchIndex;
          standardSavePromises.push(
            datasetsDB.addRecordsToDataset(dataset_id, batchRecords).then(addedBatchRecords => {
              console.log(`[generateInitialData] Batch ${idx + 1} complete: added ${addedBatchRecords.length} records (total: ${totalGenerated})`);
            }),
          );
        }

        // Save all batch results in parallel, then refresh UI once
        await Promise.all(standardSavePromises);
        emitter.emit("vllora_dataset_refresh" as any);

        completedBatches = chunkEnd;

        // Emit progress event after each parallel chunk
        emitter.emit("vllora_data_generation_progress", {
          datasetId: dataset_id,
          status: "progress",
          total: count,
          completed: totalGenerated,
          currentBatch: completedBatches,
          totalBatches,
        });

        // If no records generated at all after first chunk, throw
        if (chunkStart === 0 && totalGenerated === 0) {
          throw new Error("Failed to generate any records in first batch");
        }
      }
    }

    const totalElapsed = ((Date.now() - handlerStart) / 1000).toFixed(1);
    console.log(`[generateInitialData] Generation complete: ${totalGenerated} examples in ${totalElapsed}s`);

    // Emit completed event
    emitter.emit("vllora_data_generation_progress", {
      datasetId: dataset_id,
      status: "completed",
      total: count,
      completed: totalGenerated,
      currentBatch: totalBatches,
      totalBatches,
    });

    return {
      success: true,
      dataset_name: dataset.name,
      records_created: totalGenerated,
      training_objective: objective,
      knowledge_sources_used: knowledgeContext.hasKnowledge
        ? knowledgeContext.sourceCount
        : undefined,
    };
  } catch (error) {
    console.error("[generateInitialData] Failed:", error);
    const { dataset_id } = params as unknown as GenerateInitialDataParams;

    // Emit failed event
    if (dataset_id) {
      emitter.emit("vllora_data_generation_progress", {
        datasetId: dataset_id,
        status: "failed",
        total: 0,
        completed: 0,
        error: error instanceof Error ? error.message : "Failed to generate initial data",
      });
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate initial data",
    };
  }
};

export const generateInitialDataTool: DistriFnTool = {
  name: "generate_initial_data",
  description: `Generate initial seed records for an empty dataset based on the training objective.

Use this tool when:
- A dataset has no records yet
- You need to bootstrap the dataset with initial training examples
- The dataset has a training objective defined but no seed data

This tool generates diverse training examples based on the dataset's training objective.
You can optionally provide user guidance to focus the generation on specific aspects.
Generated records can then be used as seeds for further data generation or topic analysis.

**Knowledge Source Integration:**
If the dataset has uploaded knowledge sources (PDFs, documents), this tool automatically:
- Fetches all ready knowledge sources for the dataset
- Extracts topics, sections, and content from the sources
- Grounds the generated examples in the source material
- References specific concepts, terminology, and scenarios from the documents

This produces higher quality, more accurate training data that aligns with reference material.

Each generated example includes a user message, an ideal assistant response, and an expected
quality score — all stored as record metadata for downstream use in skill packaging.

**User Guidance:**
Pass the user's specific instructions if they mentioned what kind of data they want.
Examples: "focus on beginner concepts", "include edge cases", "emphasize error handling scenarios"`,
  type: "function",
  parameters: {
    type: "object",
    properties: {
      dataset_id: {
        type: "string",
        description: "The dataset ID to generate initial data for",
      },
      count: {
        type: "number",
        default: 10,
        description: "Number of initial records to generate (default: 10)",
      },
      user_guidance: {
        type: "string",
        description:
          'Optional user guidance for data generation (e.g., "focus on beginner concepts", "include edge cases")',
      },
    },
    required: ["dataset_id"],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(
      await generateInitialDataHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
