export interface Span {
  trace_id: string;
  span_id: string;
  thread_id: string;
  parent_span_id?: string;
  operation_name: string;
  start_time_us: number;
  finish_time_us: number;
  attribute: Attributes;
  child_attribute?: Attributes;
  run_id: string;
  parent_trace_id?: string;
  spans?: Span[];
}

export type Attributes =
  | ModelCall
  | ToolCall
  | ApiCall
  | {
      message_id?: string;
      error?: string;
      output?: string;
      [key: string]: any;
    };

export interface ModelCall {
  input: Input | string;
  model: Model;
  output: string;
  label?: string;
  provider_name?: string;
  model_name?: string;
  error?: string;
}

export interface Input {
  query: string;
}

export interface Model {
  name: string;
  provider?: string;
}

export interface RouterCall {
  router_name?: string;
  label?: string;
  error?: string;
}
export interface ToolCall {
  tool_name: string;
  arguments: object;
  output: object[];
  provider_name?: string;
  label?: string;
  tool_calls?: string;
  error?: string;
  response?: string;
  tool_results?: string;
  mcp_server?: string;
  mcp_template_definition_id?: string;
}

export interface ApiCall {
  request: string;
  output?: string;
  provider_name?: string;
  label?: string;
  error?: string;
}

export interface RunDTO {
  run_id: string | null;
  thread_ids: string[];
  trace_ids: string[];
  used_models: string[];
  request_models: string[];
  used_tools: string[];
  mcp_template_definition_ids: string[];
  cost: number;
  input_tokens: number;
  output_tokens: number;
  start_time_us: number;
  finish_time_us: number;
  errors: string[];
}
export interface Pagination {
  offset: number;
  limit: number;
  total: number;
}