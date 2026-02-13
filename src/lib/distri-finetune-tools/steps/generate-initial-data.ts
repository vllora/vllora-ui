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
import { buildKnowledgeContentBlocks } from "./shared/knowledge-context";

// =============================================================================
// Topic Hierarchy Helpers
// =============================================================================

interface LeafTopic {
  name: string;
  path: string[]; // Full path from root to leaf
}

/**
 * Extract all leaf topics from a hierarchy tree.
 * A leaf topic is one with no children or empty children array.
 */
function getLeafTopics(hierarchy: TopicHierarchyNode[], parentPath: string[] = []): LeafTopic[] {
  const leaves: LeafTopic[] = [];

  for (const node of hierarchy) {
    const currentPath = [...parentPath, node.name];

    if (!node.children || node.children.length === 0) {
      // This is a leaf node
      leaves.push({ name: node.name, path: currentPath });
    } else {
      // Recurse into children
      leaves.push(...getLeafTopics(node.children, currentPath));
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

// Number of parallel requests to make - balance between speed and API rate limits
const PARALLEL_REQUESTS = 3;


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
  generation_mode?: "rft" | "sft";
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
  system_prompt: string;
  user_message: string;
  assistant_response?: string;
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

async function getKnowledgeContext(datasetId: string): Promise<KnowledgeContext> {
  try {
    const sources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
    const readySources = sources.filter(
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

      // Collect topics
      if (extracted.topics) {
        allTopics.push(...extracted.topics);
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
  } catch (error) {
    console.warn("[generateInitialData] Failed to fetch knowledge sources:", error);
    return {
      hasKnowledge: false,
      sourceCount: 0,
      sourceNames: [],
      combinedText: "",
      topics: [],
      sections: [],
    };
  }
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
- For SFT mode, include helpful assistant responses
- For RFT mode, only generate the user prompt (assistant learns through reinforcement)
- Vary the complexity, length, and style across examples
- Include edge cases and challenging scenarios
- When knowledge sources are provided, GROUND your examples in that material
- Reference specific concepts, terminology, and scenarios from the knowledge sources
- Output MUST be valid JSON matching the schema`;

const INITIAL_DATA_GENERATION_USER_RFT = `Generate {{count}} diverse training examples for the following objective:

Training Objective:
{{objective}}
{{user_guidance}}
{{topic_context}}
{{knowledge_context}}
Generate a JSON array of examples. Each example should be a realistic user query/prompt that would be sent to an AI assistant being trained for this objective.

For each example, provide:
- system_prompt: A concise system prompt that defines the assistant's role for this specific scenario
- user_message: A realistic user message/query

Make the examples diverse in:
- Complexity (simple to complex queries)
- Length (brief to detailed)
- Tone (formal, casual, technical)
- Scenario type (different aspects of the objective)

Output Format:
{
  "examples": [
    {
      "system_prompt": "You are a helpful assistant that...",
      "user_message": "User's question or request..."
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;

const INITIAL_DATA_GENERATION_USER_SFT = `Generate {{count}} diverse training examples for the following objective:

Training Objective:
{{objective}}
{{user_guidance}}
{{topic_context}}
{{knowledge_context}}
Generate a JSON array of complete conversation examples. Each example should demonstrate the ideal assistant behavior for this objective.

For each example, provide:
- system_prompt: A concise system prompt that defines the assistant's role for this specific scenario
- user_message: A realistic user message/query
- assistant_response: An ideal, helpful response from the assistant

Make the examples diverse in:
- Complexity (simple to complex queries)
- Length (brief to detailed)
- Tone (formal, casual, technical)
- Scenario type (different aspects of the objective)

Output Format:
{
  "examples": [
    {
      "system_prompt": "You are a helpful assistant that...",
      "user_message": "User's question or request...",
      "assistant_response": "Helpful and accurate response..."
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;

const INITIAL_DATA_GENERATION_USER_STRUCTURED_RFT = `Generate {{count}} diverse training examples for a structured output task.

Training Objective:
{{objective}}
{{user_guidance}}
{{topic_context}}
{{knowledge_context}}

## STRUCTURED OUTPUT DETAILS

The model must produce structured JSON output. Use the EXACT fixed system prompt below for ALL examples.

**Fixed System Prompt (use this EXACTLY for all examples):**
{{system_prompt_template}}

**Expected Output Schema:**
{{output_schema}}

## YOUR TASK

Generate realistic input texts as user_message. The system_prompt must be the EXACT fixed system prompt above for ALL examples.

Rules for generating inputs:
- Vary names, amounts, dates, details across examples
- Include different formats: formal, informal, messy, well-structured
- Include edge cases: missing fields, unusual formatting, multiple items
- Make inputs realistic - they should look like real-world data
- Each input should contain enough information to produce the fields in the schema
- Some inputs should have partial information (missing optional fields)

For each example, provide:
- system_prompt: The EXACT fixed system prompt above (copy it verbatim)
- user_message: A realistic input text

Output Format:
{
  "examples": [
    {
      "system_prompt": "<the exact fixed system prompt>",
      "user_message": "Input text..."
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;

const INITIAL_DATA_RESPONSE_SCHEMA_RFT = {
  type: "json_schema",
  json_schema: {
    name: "initial_training_data_rft",
    strict: true,
    schema: {
      type: "object",
      properties: {
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              system_prompt: { type: "string" },
              user_message: { type: "string" },
            },
            required: ["system_prompt", "user_message"],
            additionalProperties: false,
          },
        },
      },
      required: ["examples"],
      additionalProperties: false,
    },
  },
};

const INITIAL_DATA_RESPONSE_SCHEMA_SFT = {
  type: "json_schema",
  json_schema: {
    name: "initial_training_data_sft",
    strict: true,
    schema: {
      type: "object",
      properties: {
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              system_prompt: { type: "string" },
              user_message: { type: "string" },
              assistant_response: { type: "string" },
            },
            required: ["system_prompt", "user_message", "assistant_response"],
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
  mode: "rft" | "sft",
  userGuidance?: string,
  knowledgeContext?: KnowledgeContext,
  topicContext?: LeafTopic,
  outputFormatConfig?: OutputFormatParam | null,
  fileContentBlocks?: FileContentBlock[],
): Promise<GeneratedExample[]> {
  // Select prompt template: structured output RFT when response schema is present
  let userPromptTemplate: string;
  if (outputFormatConfig && mode === "rft") {
    userPromptTemplate = INITIAL_DATA_GENERATION_USER_STRUCTURED_RFT;
  } else if (mode === "rft") {
    userPromptTemplate = INITIAL_DATA_GENERATION_USER_RFT;
  } else {
    userPromptTemplate = INITIAL_DATA_GENERATION_USER_SFT;
  }

  // Build user guidance section if provided
  const guidanceSection = userGuidance
    ? `\nUser's specific guidance:\n${userGuidance}\n`
    : "";

  // Build topic context section if provided
  const topicSection = topicContext
    ? `\n--- TOPIC FOCUS ---\nGenerate ALL examples specifically about this topic: "${topicContext.name}"\nTopic path: ${topicContext.path.join(" > ")}\nAll examples MUST be directly relevant to this specific topic.\n--- END TOPIC FOCUS ---\n`
    : "";

  // Build knowledge context section if available
  const knowledgeSection = knowledgeContext
    ? buildKnowledgeContextSection(knowledgeContext)
    : "";

  // Build structured output placeholders
  const systemPromptTemplatePlaceholder = outputFormatConfig?.system_prompt_template || "";
  const outputSchemaPlaceholder = outputFormatConfig?.schema
    ? JSON.stringify(outputFormatConfig.schema, null, 2)
    : "";

  const userPrompt = userPromptTemplate
    .replace(/\{\{count\}\}/g, String(count))
    .replace("{{objective}}", objective)
    .replace("{{user_guidance}}", guidanceSection)
    .replace("{{topic_context}}", topicSection)
    .replace("{{knowledge_context}}", knowledgeSection)
    .replace("{{system_prompt_template}}", systemPromptTemplatePlaceholder)
    .replace("{{output_schema}}", outputSchemaPlaceholder);

  const responseSchema =
    mode === "rft"
      ? INITIAL_DATA_RESPONSE_SCHEMA_RFT
      : INITIAL_DATA_RESPONSE_SCHEMA_SFT;

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
    response_format: responseSchema,
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
  mode: "rft" | "sft",
): DataInfo {
  const inputMessages = [
    { role: "system" as const, content: example.system_prompt },
    { role: "user" as const, content: example.user_message },
  ];

  if (mode === "sft" && example.assistant_response) {
    return {
      input: {
        messages: inputMessages,
        tools: [],
      },
      output: {
        messages: [
          { role: "assistant" as const, content: example.assistant_response },
        ],
        finish_reason: "stop",
      },
    };
  }

  // RFT mode: empty output for rollout
  return {
    input: {
      messages: inputMessages,
      tools: [],
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
    console.log(
      "=== [generateInitialData] Starting with params:",
      JSON.stringify(params, null, 2),
    );

    const {
      dataset_id,
      count = 10,
      generation_mode = "rft",
      user_guidance,
      distribute_by_topic = false,
      output_format,
      target_topics,
      per_topic_count,
    } = params as unknown as GenerateInitialDataParams;

    if (!dataset_id) {
      return { success: false, error: "dataset_id is required" };
    }

    // Get dataset
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }
    // get workflow
    const workflow = await workflowDB.getWorkflowByDataset(dataset_id);
    console.log("======== [generateInitialData] Workflow:", workflow);
    if (workflow) {
      // check if workflow is in topics_config or grader_config
      if (!workflow.currentStep || workflow.currentStep === "not_started") {
        await workflowDB.advanceToStep(workflow.id, "topics_config");
      }
    }

    // Get training objective
    const objective = dataset.datasetObjective;
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

    // Fetch knowledge sources for grounded generation
    const knowledgeContext = await getKnowledgeContext(dataset_id);
    if (knowledgeContext.hasKnowledge) {
      console.log(
        "[generateInitialData] Using knowledge sources:",
        knowledgeContext.sourceNames.join(", "),
      );
      console.log(
        "[generateInitialData] Knowledge topics:",
        knowledgeContext.topics.slice(0, 5).join(", "),
      );
    }

    // Fetch native file content blocks (sent only with first batch)
    const knowledgeBlocks = await buildKnowledgeContentBlocks(dataset_id);
    const firstBatchFileBlocks = knowledgeBlocks.hasFileBlocks ? knowledgeBlocks.fileBlocks : undefined;
    if (firstBatchFileBlocks) {
      console.log(`[generateInitialData] ${firstBatchFileBlocks.length} file content block(s) available — will send with first batch only`);
    }

    // Check if we should use topic-based generation
    const topicHierarchy = dataset.topicHierarchy?.hierarchy;
    const allLeafTopics = (distribute_by_topic && topicHierarchy && topicHierarchy.length > 0)
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

      // Track per-topic progress
      const topicProgress = new Map<string, number>();
      let completedBatches = 0;

      // Process batch jobs in parallel chunks
      for (let chunkStart = 0; chunkStart < allBatchJobs.length; chunkStart += PARALLEL_REQUESTS) {
        const chunkEnd = Math.min(chunkStart + PARALLEL_REQUESTS, allBatchJobs.length);
        const chunkJobs = allBatchJobs.slice(chunkStart, chunkEnd);

        console.log(`[generateInitialData] Processing batches ${chunkStart + 1}-${chunkEnd} of ${totalBatches}`);

        // Send file content blocks only with the first chunk
        const chunkFileBlocks = chunkStart === 0 ? firstBatchFileBlocks : undefined;

        // Create parallel requests for this chunk
        const batchPromises = chunkJobs.map(job =>
          callLLMForInitialData(
            objective,
            job.batchSize,
            generation_mode,
            user_guidance,
            knowledgeContext,
            job.topic,
            output_format,
            chunkFileBlocks,
          ).then(examples => ({ job, examples }))
            .catch(err => {
              console.error(`[generateInitialData] Topic "${job.topic.name}" batch ${job.batchIndex + 1} failed:`, err);
              return { job, examples: [] as GeneratedExample[] };
            })
        );

        // Wait for all parallel batches to complete
        const results = await Promise.all(batchPromises);

        // Process results and save to DB
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
          const topicRecords = examples.map((example) => ({
            data: exampleToDataInfo(example, generation_mode),
            is_generated: true,
            topic: job.topic.name,
            metadata: {
              generation_source: "initial_data",
              generation_mode,
              generated_at_ms: Date.now(),
              topic_path: job.topic.path.join(" > "),
            },
          }));

          const addedRecords = await datasetsDB.addRecordsToDataset(
            dataset_id,
            topicRecords,
          );

          console.log(`[generateInitialData] Topic "${job.topic.name}" batch ${job.batchIndex + 1}: added ${addedRecords.length} records (topic: ${currentTopicProgress}, total: ${totalGenerated})`);
          completedBatches++;

          // Refresh UI so new records appear in the Data tab
          emitter.emit("vllora_dataset_refresh" as any);
        }

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
              generation_mode,
              user_guidance,
              knowledgeContext,
              undefined,
              output_format,
              chunkFileBlocks,
            ).then(examples => ({ batchIndex, examples }))
              .catch(err => {
                console.error(`[generateInitialData] Batch ${batchIndex + 1} failed:`, err);
                return { batchIndex, examples: [] as GeneratedExample[] };
              })
          );
        }

        // Wait for all parallel batches to complete
        const results = await Promise.all(batchPromises);

        // Process results and save to DB
        for (const { batchIndex, examples } of results) {
          if (examples.length === 0) continue;

          totalGenerated += examples.length;

          const batchRecords = examples.map((example) => ({
            data: exampleToDataInfo(example, generation_mode),
            is_generated: true,
            metadata: {
              generation_source: "initial_data",
              generation_mode,
              generated_at_ms: Date.now(),
              batch_index: batchIndex,
            },
          }));

          const addedBatchRecords = await datasetsDB.addRecordsToDataset(
            dataset_id,
            batchRecords,
          );

          console.log(`[generateInitialData] Batch ${batchIndex + 1} complete: added ${addedBatchRecords.length} records (total: ${totalGenerated})`);

          // Refresh UI so new records appear in the Data tab
          emitter.emit("vllora_dataset_refresh" as any);
        }

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

    console.log("[generateInitialData] Generation complete:", totalGenerated, "examples total");

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

**Generation Modes:**
- RFT (default): Generates prompts only (empty output for reinforcement learning rollouts)
- SFT: Generates complete conversations with assistant responses

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
      generation_mode: {
        type: "string",
        enum: ["rft", "sft"],
        default: "rft",
        description:
          'Generation mode: "rft" for prompts only, "sft" for complete conversations',
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
