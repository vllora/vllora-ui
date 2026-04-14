/**
 * OtelTraceSourceViewer
 *
 * Renders a KnowledgeSource of type 'otel-trace' inside the dataset Sources
 * view. Reuses TraceMessageTimeline by reconstructing an OtelTrace from the
 * source's parts (each part = one OTel message, metadata = span attributes).
 *
 * The skill's `otel_extract.py` is the producer side that lays out the parts
 * in this shape. See finetune-skill/reference/otel-trace-ingestion.md.
 */

import { OtelTraceMessageTimeline } from '@/components/OtelTraces/OtelTraceMessageTimeline';
import { TraceViewer, type TraceViewerData } from '@/components/agent-prism/TraceViewer/TraceViewer';
import '@/components/agent-prism/theme/theme.css';
import './agent-prism-dark.css';
import { Badge } from '@/components/ui/badge';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { TraceAnalysisConsumer } from '@/contexts/TraceAnalysisContext';
import { TraceAnalysisView } from '@/components/datasets/trace-analysis/TraceAnalysisView';
import type {
  TraceRecord,
  TraceSpan,
  TraceSpanAttribute,
  TraceSpanAttributeValue,
  TraceSpanCategory,
  TraceSpanStatus,
} from '@evilmartians/agent-prism-types';
import { MessageSquare } from 'lucide-react';
import type { KnowledgeSource } from '@/types/knowledge-types';
import type {
  OtelMessage,
  OtelMessagePart,
  OtelMessageRole,
  OtelSpan,
  OtelTrace,
} from '@/types/otel-trace-types';

/**
 * A single OpenTelemetry GenAI semconv span, as produced by the skill's
 * `otel_extract.py` / the coworker's forthcoming ingest API. We only type
 * the fields this viewer actually touches; everything else is passthrough.
 */
export interface OtelSemconvSpan {
  readonly trace_id: string;
  readonly span_id: string;
  readonly parent_span_id?: string;
  readonly start_time?: string;
  readonly end_time?: string;
  readonly status_code?: string;
  readonly attributes?: Record<string, unknown>;
}

interface OtelTraceSourceViewerProps {
  readonly source?: KnowledgeSource;
  /**
   * Optional raw OTel semconv spans blob. When provided (e.g. from a
   * committed fixture or the trace_bundles API), the viewer renders
   * these via agent-prism's `<TraceViewer>` (OTLP envelope conversion
   * happens in `toOtlpDocument` below) instead of reconstructing a
   * `KnowledgeSource`-backed timeline from `source.parts`.
   */
  readonly semconvSpans?: readonly OtelSemconvSpan[];
}

const VALID_ROLES: readonly OtelMessageRole[] = ['system', 'user', 'assistant', 'tool'];

function isRole(value: unknown): value is OtelMessageRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as OtelMessageRole);
}

/**
 * Reconstruct a synthetic OtelTrace from a knowledge source's parts.
 * Each part's `contentMetadata` is expected to carry `{ role, span_id,
 * trace_id, request_model?, finish_reason?, span_kind? }` written by
 * the skill extractor. Anything missing degrades gracefully.
 */
function sourceToTrace(source: KnowledgeSource): OtelTrace | null {
  if (source.parts.length === 0) return null;

  const traceMeta = (source.metadata ?? {}) as Record<string, unknown>;
  const traceId = String(traceMeta.trace_id ?? source.id);
  const conversationId =
    typeof traceMeta.conversation_id === 'string' ? traceMeta.conversation_id : undefined;

  // Group parts by span_id (or fall back to one synthetic span).
  const bySpan = new Map<string, OtelMessage[]>();
  const spanMeta = new Map<string, Record<string, unknown>>();

  for (const part of source.parts) {
    const meta = (part.contentMetadata ?? {}) as Record<string, unknown>;
    const spanId = typeof meta.span_id === 'string' ? meta.span_id : 'span-0';
    const role: OtelMessageRole = isRole(meta.role) ? meta.role : 'user';

    const message: OtelMessage = {
      role,
      parts: [{ type: 'text', content: part.content } satisfies OtelMessagePart],
      finishReason:
        typeof meta.finish_reason === 'string' ? meta.finish_reason : undefined,
    };

    const arr = bySpan.get(spanId) ?? [];
    arr.push(message);
    bySpan.set(spanId, arr);
    if (!spanMeta.has(spanId)) spanMeta.set(spanId, meta);
  }

  const spans: OtelSpan[] = Array.from(bySpan.entries()).map(([spanId, messages]) => {
    const meta = spanMeta.get(spanId) ?? {};
    const inputs = messages.filter((m) => m.role !== 'assistant');
    const outputs = messages.filter((m) => m.role === 'assistant');
    return {
      traceId,
      spanId,
      name: typeof meta.span_name === 'string' ? meta.span_name : `chat ${spanId}`,
      startTime: typeof meta.start_time === 'string' ? meta.start_time : '',
      endTime: typeof meta.end_time === 'string' ? meta.end_time : '',
      durationMs: typeof meta.duration_ms === 'number' ? meta.duration_ms : 0,
      status: 'ok',
      operationName:
        typeof meta.operation_name === 'string' ? meta.operation_name : 'chat',
      providerName:
        typeof meta.provider_name === 'string' ? meta.provider_name : undefined,
      requestModel:
        typeof meta.request_model === 'string' ? meta.request_model : undefined,
      conversationId,
      inputMessages: inputs,
      outputMessages: outputs,
    };
  });

  return {
    traceId,
    rootSpan: spans[0],
    spans,
    conversationId,
    toolCallCount: 0,
    turnCount: spans.reduce((acc, s) => acc + (s.outputMessages?.length ?? 0), 0),
  };
}

// ─── Semconv → OTLP conversion ──────────────────────────────────────────
//
// agent-prism's adapter expects the full OTLP envelope shape and reads
// `input.value` / `output.value` attributes (OpenInference convention)
// for span content — NOT `gen_ai.input.messages`. We inject both.

function attrsToOtlp(attrs: Record<string, unknown>): TraceSpanAttribute[] {
  return Object.entries(attrs).map(([key, raw]) => {
    const value: TraceSpanAttributeValue = {};
    if (typeof raw === 'string') {
      value.stringValue = raw;
    } else if (typeof raw === 'boolean') {
      value.boolValue = raw;
    } else if (typeof raw === 'number' && Number.isInteger(raw)) {
      value.intValue = String(raw);
    } else {
      value.stringValue = JSON.stringify(raw);
    }
    return { key, value };
  });
}

/** Stringify semconv messages into a human-readable block for agent-prism. */
function messagesToText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  const lines: string[] = [];
  for (const msg of messages) {
    if (typeof msg !== 'object' || !msg) continue;
    const m = msg as Record<string, unknown>;
    const role = String(m.role ?? '');
    const parts = Array.isArray(m.parts) ? m.parts : [];
    for (const p of parts) {
      if (typeof p !== 'object' || !p) continue;
      const part = p as Record<string, unknown>;
      if (part.type === 'text' && typeof part.content === 'string') {
        lines.push(`[${role}] ${part.content}`);
      } else if (part.type === 'tool_call') {
        const args = typeof part.arguments === 'string'
          ? part.arguments
          : JSON.stringify(part.arguments ?? {});
        lines.push(`[${role}] → ${part.name}(${args})`);
      }
    }
  }
  return lines.join('\n');
}

/** Parse a timestamp to epoch milliseconds. */
function toEpochMs(ts: string | undefined): number | undefined {
  if (!ts) return undefined;
  if (/^\d{16,}$/.test(ts)) return Math.floor(Number(BigInt(ts) / 1_000_000n));
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? undefined : ms;
}

// ─── Semconv → agent-prism TraceSpan (direct, no OTLP envelope) ─────────

function mapCategory(opName: string): TraceSpanCategory {
  switch (opName) {
    case 'chat': case 'text_completion': return 'llm_call';
    case 'execute_tool': return 'tool_execution';
    case 'invoke_agent': return 'agent_invocation';
    case 'embeddings': return 'embedding';
    default: return 'span';
  }
}

function mapStatus(code: string | undefined): TraceSpanStatus {
  return code === 'ERROR' ? 'error' : 'success';
}

function semconvToTraceSpan(
  span: OtelSemconvSpan,
  childrenByParent: Map<string, OtelSemconvSpan[]>,
): TraceSpan {
  const attrs = span.attributes ?? {};
  const opName = String(attrs['gen_ai.operation.name'] ?? 'span');
  const toolName = attrs['gen_ai.tool.name'];
  const agentName = attrs['agent.name'];
  const model = attrs['gen_ai.request.model'];

  // Title for the span tree
  let title = opName;
  if (opName === 'execute_tool' && typeof toolName === 'string') title = toolName;
  else if (opName === 'invoke_agent' && typeof agentName === 'string') title = agentName;
  else if (opName === 'chat' && typeof model === 'string') title = model;
  else if (opName === 'chat') title = 'ChatCompletion';

  const startMs = toEpochMs(span.start_time) ?? 0;
  const endMs = toEpochMs(span.end_time) ?? startMs;
  const start = new Date(startMs);
  const end = new Date(endMs);

  // Build input/output strings for the DetailsView
  const inputText = opName === 'execute_tool'
    ? (attrs['gen_ai.tool.call.arguments'] != null
        ? (typeof attrs['gen_ai.tool.call.arguments'] === 'string'
            ? attrs['gen_ai.tool.call.arguments'] as string
            : JSON.stringify(attrs['gen_ai.tool.call.arguments'], null, 2))
        : undefined)
    : messagesToText(attrs['gen_ai.input.messages']) || undefined;

  const outputText = opName === 'execute_tool'
    ? (attrs['gen_ai.tool.call.result'] != null
        ? (typeof attrs['gen_ai.tool.call.result'] === 'string'
            ? attrs['gen_ai.tool.call.result'] as string
            : JSON.stringify(attrs['gen_ai.tool.call.result'], null, 2))
        : undefined)
    : messagesToText(attrs['gen_ai.output.messages']) || undefined;

  // Build attributes for the Attributes tab
  const prismAttrs: TraceSpanAttribute[] = attrsToOtlp(attrs);

  // Recurse children
  const children = (childrenByParent.get(span.span_id) ?? [])
    .map((c) => semconvToTraceSpan(c, childrenByParent));

  return {
    id: span.span_id,
    title,
    startTime: start,
    endTime: end,
    duration: endMs - startMs,
    type: mapCategory(opName),
    raw: JSON.stringify(span, null, 2),
    attributes: prismAttrs,
    children: children.length > 0 ? children : undefined,
    status: mapStatus(span.status_code),
    input: inputText,
    output: outputText,
  };
}

/** Group semconv spans by trace_id, build trees, return per-trace data. */
function buildTraceSpanTrees(spans: readonly OtelSemconvSpan[]): Map<string, TraceSpan[]> {
  // Group by trace
  const byTrace = new Map<string, OtelSemconvSpan[]>();
  for (const s of spans) {
    const tid = s.trace_id;
    const arr = byTrace.get(tid);
    if (arr) arr.push(s);
    else byTrace.set(tid, [s]);
  }

  const result = new Map<string, TraceSpan[]>();
  for (const [traceId, traceSpans] of byTrace) {
    // Group children by parent
    const childrenByParent = new Map<string, OtelSemconvSpan[]>();
    const allSpanIds = new Set(traceSpans.map((s) => s.span_id));
    for (const s of traceSpans) {
      if (s.parent_span_id && allSpanIds.has(s.parent_span_id)) {
        const arr = childrenByParent.get(s.parent_span_id);
        if (arr) arr.push(s);
        else childrenByParent.set(s.parent_span_id, [s]);
      }
    }
    // Root spans = no parent or parent not in this trace
    const roots = traceSpans.filter(
      (s) => !s.parent_span_id || !allSpanIds.has(s.parent_span_id),
    );
    result.set(traceId, roots.map((r) => semconvToTraceSpan(r, childrenByParent)));
  }
  return result;
}

function countSpans(s: TraceSpan): number {
  return 1 + (s.children ?? []).reduce((acc, c) => acc + countSpans(c), 0);
}

function AgentPrismTraceView({ spans }: { readonly spans: readonly OtelSemconvSpan[] }) {
  const data: TraceViewerData[] = useMemo(() => {
    const trees = buildTraceSpanTrees(spans);

    return Array.from(trees.entries()).map(([traceId, traceSpans]) => {
      const totalSpans = traceSpans.reduce((acc, s) => acc + countSpans(s), 0);
      const firstStart = traceSpans[0]?.startTime?.getTime() ?? 0;
      let maxEnd = firstStart;
      const walkEnd = (s: TraceSpan) => {
        const e = s.endTime?.getTime() ?? 0;
        if (e > maxEnd) maxEnd = e;
        (s.children ?? []).forEach(walkEnd);
      };
      traceSpans.forEach(walkEnd);

      const tools = new Set<string>();
      const walkTools = (s: TraceSpan) => {
        if (s.type === 'tool_execution') tools.add(s.title);
        (s.children ?? []).forEach(walkTools);
      };
      traceSpans.forEach(walkTools);

      const traceRecord: TraceRecord = {
        id: traceId,
        name: `Trace ${traceId.slice(0, 8)}`,
        spansCount: totalSpans,
        durationMs: Math.max(0, maxEnd - firstStart),
        agentDescription: tools.size > 0
          ? `Tools: ${Array.from(tools).join(', ')}`
          : 'OTel trace',
        startTime: firstStart || undefined,
      };

      return { traceRecord, spans: traceSpans };
    });
  }, [spans]);

  return (
    <div className="agent-prism-wrapper h-full">
      <TraceViewer data={data} />
    </div>
  );
}

type OtelTab = "traces" | "priority" | "grader-hints" | "seed-queries";

export function OtelTraceSourceViewer({ source, semconvSpans }: OtelTraceSourceViewerProps) {
  const trace = source ? sourceToTrace(source) : null;
  const hasSpans = semconvSpans && semconvSpans.length > 0;
  const { hasTraces: hasTraceAnalysis } = TraceAnalysisConsumer();
  const [activeTab, setActiveTab] = useState<OtelTab>("traces");

  const headerName = source?.name ?? (hasSpans ? `Trace ${semconvSpans[0]!.trace_id}` : 'OTel trace');
  const headerSubtitle = source
    ? `${source.parts.length} parts`
    : hasSpans
      ? `${semconvSpans.length} spans`
      : 'empty';

  // Flat tabs: Traces + analysis sub-views (no nested "Analysis" wrapper)
  const tabs: Array<{ id: OtelTab; label: string }> = [
    { id: "traces", label: "Traces" },
    ...(hasTraceAnalysis ? [
      { id: "priority" as OtelTab, label: "Priority" },
      { id: "grader-hints" as OtelTab, label: "Grader Hints" },
      { id: "seed-queries" as OtelTab, label: "Seed Queries" },
    ] : []),
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-violet-500/15 p-2 text-violet-300">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{headerName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                OTel trace
              </Badge>
              <span>{headerSubtitle}</span>
              {source?.description && <span>· {source.description}</span>}
            </div>
          </div>
        </div>
      </header>

      {/* Flat tabs — one level only */}
      {tabs.length > 1 && (
        <div className="flex border-b border-border/60 px-6 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-emerald-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content — directly renders the view for each tab */}
      {activeTab === "traces" ? (
        <div className={hasSpans ? "flex-1 min-h-0 overflow-hidden" : "flex-1 overflow-auto p-6"}>
          {hasSpans ? (
            <AgentPrismTraceView spans={semconvSpans} />
          ) : trace ? (
            <OtelTraceMessageTimeline trace={trace} />
          ) : (
            <p className="text-sm text-muted-foreground">This trace source has no parts.</p>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <TraceAnalysisView initialTab={activeTab} contentOnly />
        </div>
      )}
    </div>
  );
}
