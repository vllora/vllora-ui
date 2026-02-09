/**
 * Generate Initial Data Tool
 *
 * Generates initial seed records for empty datasets using the training objective
 * and optionally uploaded knowledge sources (PDFs, documents) for grounded generation.
 */

import type { DistriFnTool } from "@distri/core";
import { DistriClient, type DistriMessage } from "@distri/core";
import * as datasetsDB from "@/services/datasets-db";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import { getDistriUrl } from "@/config/api";
import { fetchLucyConfig, type LucyConfig } from "@/lib/agent-sync";
import type { ToolHandler } from "../types";
import type { DataInfo } from "@/types/dataset-types";
import * as workflowDB from "@/services/finetune-workflow-db";
import { emitter } from "@/utils/eventEmitter";

// Batch size for generation - smaller batches are faster and more reliable
const BATCH_SIZE = 10;

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

// =============================================================================
// Types
// =============================================================================

interface GenerateInitialDataParams {
  dataset_id: string;
  count?: number;
  generation_mode?: "rft" | "sft";
  /** Optional user guidance for how to generate the data (e.g., "focus on beginner concepts", "include edge cases") */
  user_guidance?: string;
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

  return parts.join("\n");
}

async function callLLMForInitialData(
  objective: string,
  count: number,
  mode: "rft" | "sft",
  userGuidance?: string,
  knowledgeContext?: KnowledgeContext,
): Promise<GeneratedExample[]> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, "")}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const userPromptTemplate =
    mode === "rft"
      ? INITIAL_DATA_GENERATION_USER_RFT
      : INITIAL_DATA_GENERATION_USER_SFT;

  // Build user guidance section if provided
  const guidanceSection = userGuidance
    ? `\nUser's specific guidance:\n${userGuidance}\n`
    : "";

  // Build knowledge context section if available
  const knowledgeSection = knowledgeContext
    ? buildKnowledgeContextSection(knowledgeContext)
    : "";

  const userPrompt = userPromptTemplate
    .replace(/\{\{count\}\}/g, String(count))
    .replace("{{objective}}", objective)
    .replace("{{user_guidance}}", guidanceSection)
    .replace("{{knowledge_context}}", knowledgeSection);

  const responseSchema =
    mode === "rft"
      ? INITIAL_DATA_RESPONSE_SCHEMA_RFT
      : INITIAL_DATA_RESPONSE_SCHEMA_SFT;

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage("system", [
      { part_type: "text", data: INITIAL_DATA_GENERATION_SYSTEM },
    ]),
    DistriClient.initDistriMessage("user", [
      { part_type: "text", data: userPrompt },
    ]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[generateInitialData] LLM call attempt ${attempt + 1}/3 for ${count} examples...`);
      const startTime = Date.now();

      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
          model: modelSettingsFromConfig.model || "openai/gpt-4.1",
          temperature: modelSettingsFromConfig.temperature ?? 0.7,
          response_format: responseSchema,
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[generateInitialData] LLM call completed in ${elapsed}s`);

      if (!response.content) {
        throw new Error("LLM returned empty response");
      }

      const parsed = JSON.parse(response.content.trim());
      console.log(`[generateInitialData] Parsed ${parsed.examples?.length || 0} examples from response`);
      return parsed.examples || [];
    } catch (err) {
      lastError = err;
      console.error(`[generateInitialData] LLM call attempt ${attempt + 1} failed:`, err);
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        console.log(`[generateInitialData] Retrying in ${backoffMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  console.error("[generateInitialData] All LLM attempts failed:", lastError);
  throw lastError instanceof Error ? lastError : new Error("LLM call failed");
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
      "[generateInitialData] Starting with params:",
      JSON.stringify(params, null, 2),
    );

    const {
      dataset_id,
      count = 10,
      generation_mode = "rft",
      user_guidance,
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

    console.log(
      "[generateInitialData] Generating data for objective:",
      objective.substring(0, 100) + "...",
    );
    console.log(
      "[generateInitialData] Count:",
      count,
      "Mode:",
      generation_mode,
    );
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

    // Calculate batches
    const totalBatches = Math.ceil(count / BATCH_SIZE);
    let totalGenerated = 0;
    const allExamples: GeneratedExample[] = [];

    // Emit started event
    emitter.emit("vllora_data_generation_progress", {
      datasetId: dataset_id,
      status: "started",
      total: count,
      completed: 0,
      currentBatch: 0,
      totalBatches,
    });

    console.log(`[generateInitialData] Generating ${count} examples in ${totalBatches} batches of ${BATCH_SIZE}`);

    // Generate examples in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const remaining = count - totalGenerated;
      const batchSize = Math.min(BATCH_SIZE, remaining);

      console.log(`[generateInitialData] Starting batch ${batchIndex + 1}/${totalBatches} (${batchSize} examples)`);

      try {
        const batchExamples = await callLLMForInitialData(
          objective,
          batchSize,
          generation_mode,
          user_guidance,
          knowledgeContext,
        );

        allExamples.push(...batchExamples);
        totalGenerated += batchExamples.length;

        // Convert batch to records and save immediately
        const batchRecords = batchExamples.map((example) => ({
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

        // Emit progress event
        emitter.emit("vllora_data_generation_progress", {
          datasetId: dataset_id,
          status: "progress",
          total: count,
          completed: totalGenerated,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
      } catch (batchError) {
        console.error(`[generateInitialData] Batch ${batchIndex + 1} failed:`, batchError);
        // Continue with other batches even if one fails
        if (totalGenerated === 0) {
          // If first batch fails with no records generated, throw
          throw batchError;
        }
        // Otherwise continue and report partial success
        break;
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
