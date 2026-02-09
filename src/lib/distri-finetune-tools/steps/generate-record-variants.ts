/**
 * Generate Record Variants Tool
 *
 * Generates variant records from a specific source record.
 * Variants inherit the source record's topic and track lineage via sourceRecordId.
 */

import type { DistriFnTool } from "@distri/core";
import { DistriClient, type DistriMessage } from "@distri/core";
import * as datasetsDB from "@/services/datasets-db";
import { getDistriUrl } from "@/config/api";
import { fetchLucyConfig, type LucyConfig } from "@/lib/agent-sync";
import type { ToolHandler } from "../types";
import type { DataInfo, DatasetRecord } from "@/types/dataset-types";

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

interface GenerateRecordVariantsParams {
  dataset_id: string;
  record_id: string;
  count?: number;
  guidance?: string;
}

interface GeneratedVariant {
  user_message: string;
}

interface GenerateRecordVariantsResult {
  success: boolean;
  error?: string;
  source_record_id?: string;
  source_topic?: string;
  variants_created?: number;
  variant_ids?: string[];
}

// =============================================================================
// Prompts
// =============================================================================

const VARIANT_GENERATION_SYSTEM = `You are an expert at creating variations of user queries/prompts for LLM fine-tuning.
Your task is to generate diverse variations of a user message while maintaining the same general intent and topic.

Rules:
- Keep the system prompt EXACTLY the same - do not modify it
- ONLY vary the user message
- Maintain the same general topic/domain as the original user message
- Vary the specific scenario, wording, phrasing, and complexity of the user message
- Create realistic, natural-sounding user queries
- Each variant should be meaningfully different (not just minor word changes)
- Output MUST be valid JSON matching the schema`;

const VARIANT_GENERATION_USER = `Generate {{count}} variations of the FINAL user message in the conversation below.

IMPORTANT:
- Keep ALL previous messages (system prompt, prior turns) EXACTLY the same
- ONLY vary the final user message
- Maintain the same conversational context

CONVERSATION CONTEXT (preserve this history unchanged):
{{conversation_context}}

FINAL USER MESSAGE TO VARY:
{{final_user_message}}
{{guidance_section}}
Create variations of the final user message that:
- Ask about similar topics but with different specific scenarios or angles
- Vary the complexity (some simpler, some more complex questions)
- Use different phrasings, tones, and styles (formal, casual, brief, detailed)
- Explore different aspects of the same domain
- Are realistic follow-up queries given the conversation context
- Make sense as a continuation of the prior conversation

Output Format:
{
  "variants": [
    {
      "user_message": "Varied user message 1..."
    },
    {
      "user_message": "Varied user message 2..."
    },
    ...
  ]
}

Generate exactly {{count}} user message variants.`;

const VARIANT_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "record_variants",
    strict: true,
    schema: {
      type: "object",
      properties: {
        variants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              user_message: { type: "string" },
            },
            required: ["user_message"],
            additionalProperties: false,
          },
        },
      },
      required: ["variants"],
      additionalProperties: false,
    },
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

interface ExtractedConversation {
  /** All messages before the final user message (context to preserve) */
  prefixMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** The final user message to generate variants of */
  finalUserMessage: string;
}

function extractMessagesFromRecord(record: DatasetRecord): ExtractedConversation | null {
  const data = record.data as DataInfo | null;
  if (!data?.input?.messages || !Array.isArray(data.input.messages)) {
    return null;
  }

  const messages = data.input.messages;

  // Find the last user message index
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].content) {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) {
    return null; // No user message found
  }

  // Prefix = all messages before the last user message
  const prefixMessages = messages.slice(0, lastUserIdx).map((msg) => ({
    role: msg.role as "system" | "user" | "assistant",
    content: msg.content || "",
  }));

  const finalUserMessage = messages[lastUserIdx].content || "";

  return { prefixMessages, finalUserMessage };
}

function variantToDataInfo(
  variant: GeneratedVariant,
  prefixMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): DataInfo {
  // Reconstruct the conversation: prefix messages + varied final user message
  const inputMessages = [
    ...prefixMessages,
    { role: "user" as const, content: variant.user_message },
  ];

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
// LLM Call
// =============================================================================

async function callLLMForVariants(
  prefixMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  finalUserMessage: string,
  count: number,
  guidance?: string,
): Promise<GeneratedVariant[]> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, "")}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const guidanceSection = guidance
    ? `\nUser's specific guidance for variations:\n${guidance}\n`
    : "";

  // Format prefix messages as conversation context
  const conversationContext = prefixMessages.length > 0
    ? prefixMessages.map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`).join("\n\n")
    : "(No prior context - this is the first message)";

  const userPrompt = VARIANT_GENERATION_USER
    .replace(/\{\{count\}\}/g, String(count))
    .replace("{{conversation_context}}", conversationContext)
    .replace("{{final_user_message}}", finalUserMessage)
    .replace("{{guidance_section}}", guidanceSection);

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage("system", [
      { part_type: "text", data: VARIANT_GENERATION_SYSTEM },
    ]),
    DistriClient.initDistriMessage("user", [
      { part_type: "text", data: userPrompt },
    ]),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], {
        model_settings: {
          ...modelSettingsFromConfig,
          model: modelSettingsFromConfig.model || "openai/gpt-4.1",
          temperature: modelSettingsFromConfig.temperature ?? 0.8, // Higher temp for more variety
          response_format: VARIANT_RESPONSE_SCHEMA,
        },
      });

      if (!response.content) {
        throw new Error("LLM returned empty response");
      }

      const parsed = JSON.parse(response.content.trim());
      return parsed.variants || [];
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("LLM call failed");
}

// =============================================================================
// Main Handler
// =============================================================================

export const generateRecordVariantsHandler: ToolHandler = async (
  params,
): Promise<GenerateRecordVariantsResult> => {
  try {
    console.log(
      "[generateRecordVariants] Starting with params:",
      JSON.stringify(params, null, 2),
    );

    const {
      dataset_id,
      record_id,
      count = 5,
      guidance,
    } = params as unknown as GenerateRecordVariantsParams;

    if (!dataset_id) {
      return { success: false, error: "dataset_id is required" };
    }

    if (!record_id) {
      return { success: false, error: "record_id is required" };
    }

    // Get the source record
    const records = await datasetsDB.getRecordsByDatasetId(dataset_id);
    const sourceRecord = records.find((r) => r.id === record_id);

    if (!sourceRecord) {
      return { success: false, error: `Record ${record_id} not found in dataset` };
    }

    // Extract messages from source record
    const extracted = extractMessagesFromRecord(sourceRecord);
    if (!extracted) {
      return {
        success: false,
        error: "Could not extract messages from source record. Record must have input.messages with at least a user message.",
      };
    }

    console.log("[generateRecordVariants] Source record extracted:", {
      prefixMessageCount: extracted.prefixMessages.length,
      finalUserMessage: extracted.finalUserMessage.substring(0, 50) + "...",
      topic: sourceRecord.topic,
    });

    // Generate variants using LLM
    const variants = await callLLMForVariants(
      extracted.prefixMessages,
      extracted.finalUserMessage,
      count,
      guidance,
    );

    console.log("[generateRecordVariants] Generated", variants.length, "variants");

    // Convert to dataset records with lineage tracking
    // Each variant preserves the full conversation history, only varying the final user message
    const recordsToAdd = variants.map((variant) => ({
      data: variantToDataInfo(variant, extracted.prefixMessages),
      is_generated: true,
      topic: sourceRecord.topic, // Inherit topic from source
      sourceRecordId: record_id, // Track lineage
      metadata: {
        generation_source: "record_variant",
        source_record_id: record_id,
        generated_at_ms: Date.now(),
      },
    }));

    const addedRecords = await datasetsDB.addRecordsToDataset(
      dataset_id,
      recordsToAdd,
    );

    console.log(
      "[generateRecordVariants] Added",
      addedRecords.length,
      "variant records to dataset",
    );

    return {
      success: true,
      source_record_id: record_id,
      source_topic: sourceRecord.topic,
      variants_created: addedRecords.length,
      variant_ids: addedRecords.map((r) => r.id),
    };
  } catch (error) {
    console.error("[generateRecordVariants] Failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate record variants",
    };
  }
};

export const generateRecordVariantsTool: DistriFnTool = {
  name: "generate_record_variants",
  description: `Generate variant records from a specific source record.

Use this tool when:
- User wants to create variations of an existing record
- User clicks "Generate variants" on a record in the UI
- You need to expand the dataset with similar but different examples

The tool will:
1. Extract the conversation from the source record (supports multi-turn conversations)
2. Preserve all conversation history (system prompt, prior user/assistant turns)
3. Generate N variations of ONLY the final user message
4. Create new records that inherit the source record's topic
5. Track lineage via sourceRecordId for provenance

Generated variants keep the full conversation history unchanged and only vary the final user message.`,
  type: "function",
  parameters: {
    type: "object",
    properties: {
      dataset_id: {
        type: "string",
        description: "The dataset ID containing the source record",
      },
      record_id: {
        type: "string",
        description: "The ID of the source record to generate variants from",
      },
      count: {
        type: "number",
        default: 5,
        description: "Number of variants to generate (default: 5)",
      },
      guidance: {
        type: "string",
        description:
          'Optional guidance for how to vary the records (e.g., "make some more challenging", "vary the tone from formal to casual")',
      },
    },
    required: ["dataset_id", "record_id"],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(
      await generateRecordVariantsHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
