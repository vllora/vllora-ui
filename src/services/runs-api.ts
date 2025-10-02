import { API_CONFIG } from '@/config/api';

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

export interface PaginatedRunsResponse {
  data: RunDTO[];
  pagination: Pagination;
}

export interface ListRunsQuery {
  // Backend expects comma-separated strings, not arrays
  runIds?: string; // Changed from runId to runIds (comma-separated)
  threadIds?: string; // Changed from string[] to string (comma-separated)
  traceIds?: string; // Added traceIds (comma-separated)
  modelName?: string;
  typeFilter?: string; // This is the display_type parameter
  include_mcp_templates?: boolean;
  // Pagination
  offset?: number;
  limit?: number;

  // Time filter fields - backend uses flattened TimeFilter
  // Option 1: Use predefined periods (preferred for shortcuts)
  period?:
    | 'last_minute'
    | 'last15_minute'
    | 'last_15_minutes'
    | 'last_hour'
    | 'last3_hours'
    | 'last_3_hours'
    | 'last12_hours'
    | 'last_12_hours'
    | 'last_day'
    | 'last_week'
    | 'last_month'
    | 'last_year';

  // Option 2: Use absolute timestamps (for custom date ranges)
  // Using current field names (backend converts seconds to microseconds)
  startTime?: number; // In seconds - backend multiplies by 1,000,000
  endTime?: number; // In seconds - backend multiplies by 1,000,000

  // Legacy fields (still supported via aliases but deprecated)
  startTimeUs?: number; // In microseconds (deprecated)
  endTimeUs?: number; // In microseconds (deprecated)
}

export const listRuns = async (props: {
  projectId: string;
  params?: ListRunsQuery;
}): Promise<PaginatedRunsResponse> => {
  const { projectId, params } = props;

  // Create a clean copy of params to avoid mutation issues
  let sendParams = { ...params };

  // Remove empty parameters
  if (!params?.threadIds) {
    delete sendParams.threadIds;
  }
  if (!params?.traceIds) {
    delete sendParams.traceIds;
  }
  if (!params?.runIds) {
    delete sendParams.runIds;
  }

  // Build query string
  const queryParams = new URLSearchParams();
  Object.entries({
    ...(sendParams || {}),
    include_mcp_templates: params?.typeFilter === 'mcp',
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const url = `${API_CONFIG.url}/runs?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
      authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || errorData.error || `Failed to fetch runs: ${response.statusText}`
    );
  }

  return await response.json();
};

export const fetchRunSpans = async (props: {
  runId: string;
  projectId: string;
  offset: number;
  limit: number;
}): Promise<{ data: Span[]; pagination: { total: number; offset: number; limit: number } }> => {
  const { runId, projectId, offset, limit } = props;

  // Build query string
  const queryParams = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  const url = `${API_CONFIG.url}/traces/run/${runId}?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
      authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || errorData.error || `Failed to fetch run spans: ${response.statusText}`
    );
  }

  const responseData = await response.json();
  return {
    data: responseData.data as Span[],
    pagination: responseData.pagination as {
      total: number;
      offset: number;
      limit: number;
    },
  };
};
