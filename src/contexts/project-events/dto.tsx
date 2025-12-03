import { Attributes } from "@/types/common-type";

// Base interface matching EventRunContext (flattened into all events)
export interface EventRunContext {
  run_id?: string;
  thread_id?: string;
  span_id?: string;
  parent_span_id?: string;
}

// Base interface for all events
export interface BaseEvent extends EventRunContext {
  type: string;
  timestamp: number;
}

// Lifecycle Events
export interface RunStartedEvent extends BaseEvent {
  type: 'RunStarted';
}

export interface RunFinishedEvent extends BaseEvent {
  type: 'RunFinished';
}

export interface RunErrorEvent extends BaseEvent {
  type: 'RunError';
  message: string;
  code?: string;
}



export interface AgentStartedEvent extends BaseEvent {
  type: 'AgentStarted';
  name?: string;
}

export interface AgentFinishedEvent extends BaseEvent {
  type: 'AgentFinished';
}

export interface TaskStartedEvent extends BaseEvent {
  type: 'TaskStarted';
  name?: string;
}

export interface TaskFinishedEvent extends BaseEvent {
  type: 'TaskFinished';
}

export interface StepStartedEvent extends BaseEvent {
  type: 'StepStarted';
  step_name: string;
}

export interface StepFinishedEvent extends BaseEvent {
  type: 'StepFinished';
  step_name: string;
}

// Text Message Events
export interface TextMessageStartEvent extends BaseEvent {
  type: 'TextMessageStart';
  role: string;
}

export interface TextMessageContentEvent extends BaseEvent {
  type: 'TextMessageContent';
  delta: string;
}

export interface TextMessageEndEvent extends BaseEvent {
  type: 'TextMessageEnd';
}

// Tool Call Events
export interface ToolCallStartEvent extends BaseEvent {
  type: 'ToolCallStart';
  tool_call_id: string;
  tool_call_name: string;
}

export interface ToolCallArgsEvent extends BaseEvent {
  type: 'ToolCallArgs';
  delta: string;
  tool_call_id: string;
}

export interface ToolCallEndEvent extends BaseEvent {
  type: 'ToolCallEnd';
  tool_call_id: string;
}

export interface ToolCallResultEvent extends BaseEvent {
  type: 'ToolCallResult';
  tool_call_id: string;
  content: string;
  role: string;
}

// State Management Events
export interface StateSnapshotEvent extends BaseEvent {
  type: 'StateSnapshot';
  snapshot: any; // serde_json::Value
}

export interface StateDeltaEvent extends BaseEvent {
  type: 'StateDelta';
  delta: any; // serde_json::Value
}

export interface MessagesSnapshotEvent extends BaseEvent {
  type: 'MessagesSnapshot';
  messages: any[]; // Vec<serde_json::Value>
}

// Special Events
export interface RawEvent extends BaseEvent {
  type: 'Raw';
  event: any; // serde_json::Value
  source?: string;
}

// Custom Event Types (matches Rust CustomEventType enum)
export interface CustomSpanStartEventType {
  type: 'span_start';
  operation_name: string;
  attributes: any;
}

export interface CustomSpanEndEventType {
  type: 'span_end';
  operation_name: string;
  attributes: any;
  start_time_unix_nano: number;
  finish_time_unix_nano: number;
}

export interface CustomPingEventType {
  type: 'ping';
}

export interface CustomImageGenerationFinishEventType {
  type: 'image_generation_finish';
  model_name: string;
  quality: string;
  size: string;
  count_of_images: number;
  steps: number;
}

export interface CustomLlmStartEventType {
  type: 'llm_start';
  provider_name: string;
  model_name: string;
  input: string;
}

export interface CustomLlmStopEventType {
  type: 'llm_stop';
  content?: string;
}

export interface CustomCostEventType {
  type: 'cost';
  value: CostEvent;
}

export interface CustomCustomEventType {
  type: 'custom_event';
  operation: string;
  attributes: any;
}

export interface CustomBreakpointEventType {
  type: 'breakpoint';
  request: any; // ChatCompletionRequest
}

export interface CustomBreakpointResumeEventType {
  type: 'breakpoint_resume';
  updated_request?: any; // Optional ChatCompletionRequest
}

// Discriminated union of all custom event types
export type CustomEventType =
  | CustomSpanStartEventType
  | CustomSpanEndEventType
  | CustomPingEventType
  | CustomImageGenerationFinishEventType
  | CustomLlmStartEventType
  | CustomLlmStopEventType
  | CustomCostEventType
  | CustomCustomEventType
  | CustomBreakpointEventType
  | CustomBreakpointResumeEventType;

export interface CustomEvent extends BaseEvent {
  type: 'Custom';
  event: CustomEventType; // Renamed from 'custom_event' via #[serde(rename = "event")]
}

// Cost event structure
export interface CostEvent {
  cost: number;
  usage?: UsageData;
}

export interface UsageData {
  completion_tokens_details?: any;
  input_tokens: number;
  is_cache_used: boolean;
  output_tokens: number;
  prompt_tokens_details?: any;
  total_tokens: number;
}

// Discriminated union of all event types
export type ProjectEventUnion =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | AgentStartedEvent
  | AgentFinishedEvent
  | TaskStartedEvent
  | TaskFinishedEvent
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
  | CustomEvent;

// Legacy interfaces (kept for backward compatibility, but deprecated)
/** @deprecated Use EventRunContext instead */
export interface ProjectEvent extends EventRunContext {
  timestamp: number;
}

/** @deprecated Use CustomEvent with proper typing */
export interface LangDBCustomEvent extends BaseEvent {
  type: 'Custom';
  name: string;
  value: any;
}

// Span structure from Custom events
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
  tenant_id?: string;
}

export interface ProjectEventsHookProps {
  projectId: string;
}

export interface ProjectEventsState {
  isConnected: boolean;
  isConnecting: boolean;
  isRetrying: boolean;
  retryAttempt: number;
  error: string | null;
}
