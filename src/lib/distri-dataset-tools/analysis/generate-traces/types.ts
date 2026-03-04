/**
 * Shared types for trace generation
 */

import type { DatasetRecord } from '@/types/dataset-types';

export interface SyntheticToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface SyntheticMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: SyntheticToolCall[] | null;
  tool_call_id: string | null;
}

export interface SyntheticTraceRecord {
  topic_path: string[];
  persona: string;
  messages: SyntheticMessage[];
  /** Ideal assistant response for skill package JSONL */
  skillResponse?: string;
  /** LLM-assigned quality score (0.0-1.0) for skill package */
  baseScore?: number;
}

export interface AssistantTurnOutput {
  content: string;
  tool_calls: SyntheticToolCall[] | null;
}

export interface GenerateTracesResult {
  success: boolean;
  error?: string;
  dataset_name?: string;
  created_count?: number;
  record_ids?: string[];
}

export interface GenerateTracesParams {
  dataset_id?: string;
  dataset_name?: string;
  record_ids?: string[];
  count?: number;
  max_turns?: number;
  /** Maximum number of concurrent LLM requests (default: 5, max: 10) */
  concurrency?: number;
  /** Whether to generate for all topics or only selected ones */
  target_topics?: 'all' | 'selected';
  /** List of topic names to generate for (when targetTopics is 'selected') */
  selected_topics?: string[];
  /** Callback for progress updates (can be async) */
  on_progress?: (progress: { completed: number; total: number }) => void | Promise<void>;
  /** Callback when new records are added - receives the created records */
  on_records_added?: (records: DatasetRecord[]) => void | Promise<void>;
}

export interface TopicHierarchyNode {
  id: string;
  name: string;
  children?: TopicHierarchyNode[];
  sourceChunkRefs?: string[];
  promptTemplate?: string;
  normalizedPromptSegment?: string;
}

export interface LeafTopic {
  id: string;   // Topic ID for storing in records
  name: string; // Topic name for display/matching
  path: string[];
  sourceChunkRefs?: string[];
  promptTemplate?: string;
  normalizedSegments?: (string | undefined)[];
}

export interface TopicGenerationTask {
  topicId: string;    // Topic ID for storing in records
  topicName: string;  // Topic name for display
  topicPath: string[];
  recordsToGenerate: number;
  seedRecords: (DatasetRecord | undefined)[];
  tools: any[];
  /** Resolved knowledge source text for prompt injection (from sourceChunkRefs) */
  knowledgeContext?: string;
  /** Original chunk refs for lineage tracking on generated records */
  sourceChunkRefs?: string[];
  /** Pre-built shared system prompt for this topic (from buildTopicSystemPrompt) */
  topicSystemPrompt?: string;
}

export interface TopicGenerationResult {
  topicName: string;
  records: Array<{
    data: any;
    metadata?: Record<string, unknown>;
    topic?: string;
    is_generated?: boolean;
    evaluation?: undefined;
  }>;
  errors: string[];
}

/**
 * Callbacks for tracking generation progress across parallel topics
 */
export interface GenerationCallbacks {
  datasetId: string;
  totalExpectedRecords: number;
  /** Shared counter for tracking total created records across parallel topics */
  progressCounter: { count: number };
  on_progress?: (progress: { completed: number; total: number }) => void | Promise<void>;
  on_records_added?: (records: DatasetRecord[]) => void | Promise<void>;
}

// Constants
export const DEFAULT_MAX_TURNS = 3;
export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_RECORDS_PER_TOPIC = 5;
export const DEFAULT_PERSONA_GUIDANCE = 'Diverse and realistic';
/** Number of topics to process in each batch to avoid overwhelming the queue */
export const DEFAULT_BATCH_SIZE = 5;
