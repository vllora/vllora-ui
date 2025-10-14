export enum MessageType {
  HumanMessage = 'human',
  AIMessage = 'assistant',
  SystemMessage = 'system',
  ToolMessage = 'tool',
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
}

export interface Thread {
  id: string;
  cost?: number;
  output_tokens?: number;
  input_tokens?: number;
  project_id: string;
  mcp_template_definition_ids?: string[];
  description?: string;
  model_name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  score?: number;
  title?: string;
  tags_info?: string[];
  errors?: string[];
  input_models?: string[];
  request_model_name?: string;
  is_public?: boolean;
  is_from_local?: boolean;
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