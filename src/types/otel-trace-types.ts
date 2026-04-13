/**
 * OTel GenAI Trace Types
 *
 * Mirrors the OpenTelemetry GenAI semantic conventions (April 2026).
 * Spec: https://opentelemetry.io/docs/specs/semconv/gen-ai/
 *
 * These types are the canonical shape we ingest from a coworker's OTel
 * ingest API. The mock adapter uses the same shape so swapping to a real
 * backend is a one-line change in service-registry.
 *
 * Notes:
 * - `gen_ai.prompt` and `gen_ai.completion` events are DEPRECATED (v1.38.0)
 *   in favor of `gen_ai.input.messages` / `gen_ai.output.messages`. Do not
 *   add fields for the deprecated shape.
 * - Content attributes are opt-in: any of `inputMessages`, `outputMessages`,
 *   `systemInstructions` may be missing if the producer didn't enable them.
 * - Multi-turn conversations are correlated by `gen_ai.conversation.id`.
 */

// ─── Message parts ───────────────────────────────────────────────────────────

export type OtelMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type OtelMessagePart =
  | OtelTextPart
  | OtelToolCallPart
  | OtelToolResultPart;

export interface OtelTextPart {
  readonly type: 'text';
  readonly content: string;
}

export interface OtelToolCallPart {
  readonly type: 'tool_call';
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface OtelToolResultPart {
  readonly type: 'tool_result';
  readonly toolCallId: string;
  readonly result: unknown;
  readonly isError?: boolean;
}

export interface OtelMessage {
  readonly role: OtelMessageRole;
  readonly parts: OtelMessagePart[];
  /** Only present on assistant messages — `stop`, `length`, `tool_calls`, etc. */
  readonly finishReason?: string;
}

// ─── Spans ───────────────────────────────────────────────────────────────────

/**
 * Operation kinds we render. Maps to `gen_ai.operation.name`.
 * Anything else is rendered as a generic span.
 */
export type OtelOperationName =
  | 'chat'
  | 'embeddings'
  | 'execute_tool'
  | 'invoke_agent'
  | 'text_completion';

/** Token usage from `gen_ai.usage.*` */
export interface OtelTokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface OtelSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  /** ISO timestamp */
  readonly startTime: string;
  /** ISO timestamp */
  readonly endTime: string;
  /** Milliseconds */
  readonly durationMs: number;
  readonly status: 'ok' | 'error' | 'unset';
  readonly statusMessage?: string;

  // gen_ai.* attributes
  readonly operationName: OtelOperationName | string;
  readonly providerName?: string;
  readonly requestModel?: string;
  readonly responseModel?: string;
  readonly temperature?: number;
  readonly usage?: OtelTokenUsage;
  readonly finishReasons?: string[];

  // Agent attributes (only present on invoke_agent spans)
  readonly agentId?: string;
  readonly agentName?: string;
  readonly conversationId?: string;

  // Tool attributes (only present on execute_tool spans)
  readonly toolName?: string;
  readonly toolType?: 'function' | 'extension' | 'datastore' | string;
  readonly toolCallId?: string;
  readonly toolCallArguments?: Record<string, unknown>;
  readonly toolCallResult?: unknown;

  // Content (opt-in attributes — may be absent)
  readonly systemInstructions?: string;
  readonly inputMessages?: OtelMessage[];
  readonly outputMessages?: OtelMessage[];

  /** Catch-all for any non-standard attributes the producer added. */
  readonly extraAttributes?: Record<string, unknown>;
}

// ─── Trace + conversation aggregates ─────────────────────────────────────────

/**
 * A `Trace` is the unit we list in the trace table. In OTel terms it is one
 * top-level span (or one logical operation). For grouping we also expose
 * `OtelConversation` which collapses traces sharing a conversation id.
 */
export interface OtelTrace {
  readonly traceId: string;
  /** Root span — what we render as the headline row. */
  readonly rootSpan: OtelSpan;
  /** All spans in this trace, in start-time order. Includes the root. */
  readonly spans: OtelSpan[];
  /** Convenience: shared by all spans if set. */
  readonly conversationId?: string;
  /** Convenience: aggregated across spans. */
  readonly totalTokens?: number;
  /** Convenience: number of execute_tool spans in this trace. */
  readonly toolCallCount: number;
  /** Convenience: number of distinct turns (assistant messages) across the trace. */
  readonly turnCount: number;
}

export interface OtelConversation {
  readonly conversationId: string;
  readonly traces: OtelTrace[];
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly turnCount: number;
  readonly toolCallCount: number;
  readonly totalTokens: number;
  readonly models: string[];
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface OtelTraceFilters {
  /** Free-text match on prompts/completions. */
  readonly search?: string;
  /** ISO timestamp lower bound. */
  readonly since?: string;
  /** ISO timestamp upper bound. */
  readonly until?: string;
  /** `gen_ai.request.model` exact match. */
  readonly model?: string;
  /** `gen_ai.provider.name` exact match. */
  readonly provider?: string;
  /** Only traces that contain at least one execute_tool span. */
  readonly hasToolCalls?: boolean;
  /** Only traces with status === 'error'. */
  readonly hasError?: boolean;
  /** Minimum number of assistant turns. */
  readonly minTurns?: number;
}

export interface OtelTraceListResult {
  readonly traces: OtelTrace[];
  readonly total: number;
  readonly nextCursor?: string;
}
