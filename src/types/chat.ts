import { Span } from "./common-type";

export enum MessageType {
  HumanMessage = 'human',
  AIMessage = 'assistant',
  SystemMessage = 'system',
  ToolMessage = 'tool',
  UserMessage = 'user',
}

export enum MessageContentType {
  Text = 'text',
  Image = 'image',
  Audio = 'audio',
}

export interface FileWithPreview extends File {
  preview?: string;
  base64?: string;
  raw_file?: File;
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ModelUsage {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

export interface MessageMetrics {
  run_id?: string;
  trace_id?: string;
  usage?: ModelUsage;
  cost?: number;
  ttft?: number;
  duration?: number;
  start_time_us?: number;
}

export interface Message {
  id: string;
  type: string;
  role?: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  content_type?: string;
  thread_id?: string;
  content_array?: any[];
  trace_id?: string;
  model_name?: string;
  files?: FileWithPreview[];
  tool_call_id?: any;
  created_at?: string;
  tool_calls?: ToolCall[];
  metrics?: MessageMetrics[];

  is_from_local?: boolean;
  is_loading?: boolean;
  level?: number;
  span_id?: string;
  span?:Span,
  children?: Message[]
}

export interface Thread {
  // Core fields from API
  thread_id: string;
  start_time_us: number;
  finish_time_us: number;
  run_ids: string[];
  input_models: string[]; // Unique model names extracted from traces with same thread_id
  cost: number; // Sum of all costs from spans with same thread_id

  // UI-specific fields (derived or fetched separately)
  id: string; // Same as thread_id, for compatibility with existing UI code
  created_at: string; // ISO timestamp derived from start_time_us
  updated_at: string; // ISO timestamp derived from finish_time_us
  title?: string; // Fetched from threads table or generated
  is_from_local?: boolean; // For draft threads
}

export interface CreateThreadRequest {
  model: string;
  title?: string;
}

export interface SendMessageRequest {
  threadId: string;
  content: string;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: ModelUsage;
}