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
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
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