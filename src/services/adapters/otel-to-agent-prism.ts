/**
 * OTel → agent-prism adapter
 *
 * Converts our canonical `OtelTrace` (src/types/otel-trace-types.ts) into
 * agent-prism's `TraceRecord` + `TraceSpan` tree shape, so the vendored
 * `TreeView` and `DetailsView` components can render it.
 *
 * agent-prism's data shape (recursive tree) differs from ours (flat span
 * list grouped by `parentSpanId`), so this adapter does two things:
 *   1. Group spans by parent → build a tree
 *   2. Map our gen_ai.* metadata into agent-prism's TraceSpanCategory +
 *      attributes shape
 */

import type {
  TraceRecord,
  TraceSpan,
  TraceSpanCategory,
  TraceSpanStatus,
  TraceSpanAttribute,
} from '@evilmartians/agent-prism-types';
import type {
  OtelMessage,
  OtelMessagePart,
  OtelSpan,
  OtelTrace,
} from '@/types/otel-trace-types';

// ─── Mapping helpers ─────────────────────────────────────────────────────────

function mapCategory(operationName: string): TraceSpanCategory {
  switch (operationName) {
    case 'chat':
    case 'text_completion':
      return 'llm_call';
    case 'embeddings':
      return 'embedding';
    case 'execute_tool':
      return 'tool_execution';
    case 'invoke_agent':
      return 'agent_invocation';
    default:
      return 'span';
  }
}

function mapStatus(status: OtelSpan['status']): TraceSpanStatus {
  switch (status) {
    case 'ok':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'success';
  }
}

function stringifyMessage(message: OtelMessage): string {
  return message.parts.map(stringifyPart).join('\n').trim();
}

function stringifyPart(part: OtelMessagePart): string {
  switch (part.type) {
    case 'text':
      return part.content;
    case 'tool_call':
      return `[tool_call ${part.name} id=${part.id}] ${JSON.stringify(part.arguments)}`;
    case 'tool_result':
      return `[tool_result id=${part.toolCallId}] ${JSON.stringify(part.result)}`;
  }
}

function buildAttributes(span: OtelSpan): TraceSpanAttribute[] {
  const out: TraceSpanAttribute[] = [];
  const push = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string') {
      out.push({ key, value: { stringValue: value } });
    } else if (typeof value === 'number') {
      out.push({ key, value: { intValue: String(value) } });
    } else {
      out.push({ key, value: { boolValue: value } });
    }
  };
  push('gen_ai.operation.name', span.operationName);
  push('gen_ai.provider.name', span.providerName);
  push('gen_ai.request.model', span.requestModel);
  push('gen_ai.response.model', span.responseModel);
  push('gen_ai.request.temperature', span.temperature);
  push('gen_ai.usage.input_tokens', span.usage?.inputTokens);
  push('gen_ai.usage.output_tokens', span.usage?.outputTokens);
  push('gen_ai.usage.total_tokens', span.usage?.totalTokens);
  push('gen_ai.response.finish_reasons', span.finishReasons?.join(','));
  push('gen_ai.agent.id', span.agentId);
  push('gen_ai.agent.name', span.agentName);
  push('gen_ai.conversation.id', span.conversationId);
  push('gen_ai.tool.name', span.toolName);
  push('gen_ai.tool.type', span.toolType);
  push('gen_ai.tool.call.id', span.toolCallId);
  if (span.systemInstructions) {
    push('gen_ai.system_instructions', span.systemInstructions);
  }
  return out;
}

// ─── Tree builder ────────────────────────────────────────────────────────────

function toAgentPrismSpan(
  span: OtelSpan,
  childrenByParent: Map<string | undefined, OtelSpan[]>,
): TraceSpan {
  const start = new Date(span.startTime);
  const end = new Date(span.endTime);
  const childSpans = (childrenByParent.get(span.spanId) ?? []).map((c) =>
    toAgentPrismSpan(c, childrenByParent),
  );

  // Concatenate all input/output messages into single strings for the
  // DetailsView's input/output panes. Tool spans use their args/result.
  const inputStr =
    span.operationName === 'execute_tool'
      ? span.toolCallArguments
        ? JSON.stringify(span.toolCallArguments, null, 2)
        : undefined
      : (span.inputMessages ?? []).map(stringifyMessage).join('\n\n') || undefined;

  const outputStr =
    span.operationName === 'execute_tool'
      ? span.toolCallResult !== undefined
        ? JSON.stringify(span.toolCallResult, null, 2)
        : undefined
      : (span.outputMessages ?? []).map(stringifyMessage).join('\n\n') || undefined;

  return {
    id: span.spanId,
    title: span.toolName ?? span.requestModel ?? span.name,
    startTime: start,
    endTime: end,
    duration: span.durationMs,
    type: mapCategory(span.operationName),
    raw: JSON.stringify(span, null, 2),
    attributes: buildAttributes(span),
    children: childSpans.length > 0 ? childSpans : undefined,
    status: mapStatus(span.status),
    cost: undefined,
    tokensCount: span.usage?.totalTokens,
    input: inputStr,
    output: outputStr,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface AgentPrismTraceData {
  readonly traceRecord: TraceRecord;
  readonly spans: TraceSpan[];
}

/**
 * Convert a single OtelTrace into agent-prism's `{ traceRecord, spans }`
 * shape. Spans are returned as a forest (root spans with nested children).
 */
export function otelTraceToAgentPrism(trace: OtelTrace): AgentPrismTraceData {
  // Group children by parent so the recursion can build the tree.
  const childrenByParent = new Map<string | undefined, OtelSpan[]>();
  for (const s of trace.spans) {
    const arr = childrenByParent.get(s.parentSpanId) ?? [];
    arr.push(s);
    childrenByParent.set(s.parentSpanId, arr);
  }
  const roots = childrenByParent.get(undefined) ?? [trace.rootSpan];
  const spans = roots.map((r) => toAgentPrismSpan(r, childrenByParent));

  const root = trace.rootSpan;
  const traceRecord: TraceRecord = {
    id: trace.traceId,
    name: root.name,
    spansCount: trace.spans.length,
    durationMs: root.durationMs,
    agentDescription:
      root.agentName ?? trace.conversationId ?? root.requestModel ?? root.providerName ?? '',
    totalTokens: trace.totalTokens,
    startTime: new Date(root.startTime).getTime(),
  };

  return { traceRecord, spans };
}

/** Convert many traces at once. */
export function otelTracesToAgentPrism(traces: OtelTrace[]): AgentPrismTraceData[] {
  return traces.map(otelTraceToAgentPrism);
}
