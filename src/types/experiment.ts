// Content part type for structured/multimodal messages (text, images, audio, files)
export interface MessageContentPart {
  type: "text" | "image_url" | "input_audio" | "file";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
  input_audio?: { data: string; format: "wav" | "mp3" };
  file?: { file_data: string; file_id?: string; filename?: string };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  // Content can be string or array of content parts (for multimodal/structured messages)
  content: string | MessageContentPart[];
  [key: string]: unknown;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

export interface ExperimentData {
  name: string;
  description: string;
  messages: Message[];
  model: string;
  tools?: Tool[];
  tool_choice?: string | { type: "function"; function: { name: string } };
  headers?: Record<string, string>;
  promptVariables?: Record<string, string>;
  stream?: boolean;
  // Allow any additional parameters (model-specific parameters like temperature, max_tokens, etc.)
  [key: string]: unknown;
}

export interface ExperimentResult {
  content: string;
  rawResponse: any;
}
