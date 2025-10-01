export enum MessageType {
  HumanMessage = 'HumanMessage',
  AIMessage = 'AIMessage',
  SystemMessage = 'SystemMessage',
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
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type?: MessageType;
  content_type?: MessageContentType;
  thread_id?: string;
  trace_id?: string;
  run_id?: string;
  model_name?: string;
  files?: FileWithPreview[];
  tool_calls?: ToolCall[];
  metrics?: MessageMetrics[];
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