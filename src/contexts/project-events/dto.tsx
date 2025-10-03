import { Attributes } from "@/types/common-type";

// Base interface for all project events with run context
export interface ProjectEvent {
    timestamp: number;
    run_id?: string;
    thread_id?: string;
  }

  // Lifecycle Events
  export interface RunStartedEvent extends ProjectEvent {
    type: 'RunStarted';
  }

  export interface RunFinishedEvent extends ProjectEvent {
    type: 'RunFinished';
  }

  export interface RunErrorEvent extends ProjectEvent {
    type: 'RunError';
    message: string;
    code?: string;
  }

  export interface StepStartedEvent extends ProjectEvent {
    type: 'StepStarted';
    step_name: string;
  }

  export interface StepFinishedEvent extends ProjectEvent {
    type: 'StepFinished';
    step_name: string;
  }

  // Text Message Events
  export interface TextMessageStartEvent extends ProjectEvent {
    type: 'TextMessageStart';
    message_id: string;
    role: string;
  }

  export interface TextMessageContentEvent extends ProjectEvent {
    type: 'TextMessageContent';
    delta: string;
    message_id: string;
  }

  export interface TextMessageEndEvent extends ProjectEvent {
    type: 'TextMessageEnd';
    message_id: string;
  }

  // Tool Call Events
  export interface ToolCallStartEvent extends ProjectEvent {
    type: 'ToolCallStart';
    tool_call_id: string;
    parent_message_id?: string;
    tool_call_name: string;
  }

  export interface ToolCallArgsEvent extends ProjectEvent {
    type: 'ToolCallArgs';
    delta: string;
    tool_call_id: string;
  }

  export interface ToolCallEndEvent extends ProjectEvent {
    type: 'ToolCallEnd';
    tool_call_id: string;
  }

  export interface ToolCallResultEvent extends ProjectEvent {
    type: 'ToolCallResult';
    message_id?: string;
    tool_call_id: string;
    content: string;
    role: string;
  }

  // State Management Events
  export interface StateSnapshotEvent extends ProjectEvent {
    type: 'StateSnapshot';
    snapshot: any; // JSON value
  }

  export interface StateDeltaEvent extends ProjectEvent {
    type: 'StateDelta';
    delta: any; // JSON Patch operations
  }

  export interface MessagesSnapshotEvent extends ProjectEvent {
    type: 'MessagesSnapshot';
    messages: any[]; // Array of message objects
  }

  // Special Events
  export interface RawEvent extends ProjectEvent {
    type: 'Raw';
    event: any; // Original event data
    source?: string;
  }

  export interface LangDBCustomEvent extends ProjectEvent {
    type: 'Custom';
    name: string;
    value: any; // Custom event value
  }

  export interface ThreadEventValue {
    id: string; // thread_id,
    cost?: number;
    created_at?: string;
    description?: string;
    event_type?: string;
    input_models?: string[];
    input_tokens?: number;
    is_public?: boolean;
    mcp_template_definition_ids?: string[];
    model_name?: string;
    output_tokens?: number;
    prompt_tokens?: number;
    errors?: string[];
    score?: number;
    request_model_name?: string;
    project_id?: string;
    tags_info?: string[];
    title?: string;
    updated_at?: string;
  }

  export interface CostValueData {
    cost: number;
    usage: UsageValueData | undefined;
  }

  export interface UsageValueData {
    completion_tokens_details?: any;
    input_tokens: number;
    is_cache_used: boolean;
    output_tokens: number;
    prompt_tokens_details?: any;
    total_tokens: number;
  }

  export interface LangDBEventSpan {
    attribute?: Attributes;
    attributes?: Attributes;
    child_attribute?: Attributes;
    end_time_unix_nano: number;
    operation_name: string;
    start_time_unix_nano: number;
    trace_id: string;
    span_id: string;
    thread_id: string;
    parent_span_id?: string;
    run_id: string;
    parent_trace_id?: string;
    tags?: {
        [key: string]: string;
    };
    // acctually the tenant_id is the tenant slug
    tenant_id?: string;
  }

  // Discriminated union of all event types
  export type ProjectEventUnion =
    | RunStartedEvent
    | RunFinishedEvent
    | RunErrorEvent
    | StepStartedEvent
    | StepFinishedEvent
    | TextMessageStartEvent
    | TextMessageContentEvent
    | TextMessageEndEvent
    | ToolCallStartEvent
    | ToolCallArgsEvent
    | ToolCallEndEvent
    | ToolCallResultEvent
    | StateSnapshotEvent
    | StateDeltaEvent
    | MessagesSnapshotEvent
    | RawEvent
    | LangDBCustomEvent;

  export interface ProjectEventsHookProps {
    projectId: string;
  }

  export interface ProjectEventsState {
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
  }
