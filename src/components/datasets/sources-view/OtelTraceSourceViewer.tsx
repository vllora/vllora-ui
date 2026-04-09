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
import { TraceViewer } from '@/components/agent-prism/TraceViewer/TraceViewer';
import { Badge } from '@/components/ui/badge';
import { openTelemetrySpanAdapter } from '@evilmartians/agent-prism-data';
import type {
  OpenTelemetryDocument,
  OpenTelemetrySpan,
  OpenTelemetryStatusCode,
  TraceRecord,
  TraceSpanAttribute,
  TraceSpanAttributeValue,
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

/**
 * Convert a plain `Record<string, unknown>` attribute map (the shape our
 * skill's `otel_extract.py` emits) into OTLP-style `TraceSpanAttribute[]`
 * (what agent-prism's OpenTelemetry adapter expects).
 *
 * agent-prism's `openTelemetrySpanAdapter.convertRawDocumentsToSpans`
 * takes a full OTLP envelope (`resourceSpans → scopeSpans → spans`),
 * so we wrap our flat span list in a synthetic single-resource
 * envelope below.
 */
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

function isoToUnixNano(iso: string | undefined): string {
  if (!iso) return '0';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '0';
  return String(BigInt(ms) * 1_000_000n);
}

function mapStatusCode(code: string | undefined): OpenTelemetryStatusCode {
  if (code === 'ERROR') return 'STATUS_CODE_ERROR';
  if (code === 'OK') return 'STATUS_CODE_OK';
  return 'STATUS_CODE_UNSET';
}

function toOtlpSpan(span: OtelSemconvSpan): OpenTelemetrySpan {
  const attrs = span.attributes ?? {};
  const opName = String(attrs['gen_ai.operation.name'] ?? 'span');
  const toolName = attrs['gen_ai.tool.name'];
  const name =
    opName === 'execute_tool' && typeof toolName === 'string'
      ? `execute_tool ${toolName}`
      : opName;
  return {
    traceId: span.trace_id,
    spanId: span.span_id,
    parentSpanId: span.parent_span_id,
    name,
    kind: 'SPAN_KIND_INTERNAL',
    startTimeUnixNano: isoToUnixNano(span.start_time),
    endTimeUnixNano: isoToUnixNano(span.end_time),
    attributes: attrsToOtlp(attrs),
    status: { code: mapStatusCode(span.status_code) },
    flags: 0,
  };
}

function toOtlpDocument(spans: readonly OtelSemconvSpan[]): OpenTelemetryDocument {
  return {
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: 'vllora-otel-skill' },
            spans: spans.map(toOtlpSpan),
          },
        ],
      },
    ],
  };
}

function toTraceRecord(spans: readonly OtelSemconvSpan[]): TraceRecord {
  const traceId = spans[0]?.trace_id ?? 'unknown';
  const first = spans[0];
  const startMs = first?.start_time ? Date.parse(first.start_time) : undefined;
  let endMs = startMs;
  for (const s of spans) {
    if (!s.end_time) continue;
    const ms = Date.parse(s.end_time);
    if (!Number.isNaN(ms) && (endMs === undefined || ms > endMs)) endMs = ms;
  }
  const durationMs =
    startMs !== undefined && endMs !== undefined ? Math.max(0, endMs - startMs) : 0;
  return {
    id: traceId,
    name: `Trace ${traceId.slice(0, 8)}`,
    spansCount: spans.length,
    durationMs,
    agentDescription: 'OTel trace',
    startTime: startMs,
  };
}

function AgentPrismTraceView({ spans }: { readonly spans: readonly OtelSemconvSpan[] }) {
  const converted = openTelemetrySpanAdapter.convertRawDocumentsToSpans(
    toOtlpDocument(spans),
  );
  return (
    <TraceViewer
      data={[
        {
          traceRecord: toTraceRecord(spans),
          spans: converted,
        },
      ]}
    />
  );
}

export function OtelTraceSourceViewer({ source, semconvSpans }: OtelTraceSourceViewerProps) {
  const trace = source ? sourceToTrace(source) : null;
  const hasSpans = semconvSpans && semconvSpans.length > 0;

  const headerName = source?.name ?? (hasSpans ? `Trace ${semconvSpans[0]!.trace_id}` : 'OTel trace');
  const headerSubtitle = source
    ? `${source.parts.length} parts`
    : hasSpans
      ? `${semconvSpans.length} spans`
      : 'empty';

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

      <div className="flex-1 overflow-auto p-6">
        {hasSpans ? (
          <AgentPrismTraceView spans={semconvSpans} />
        ) : trace ? (
          <OtelTraceMessageTimeline trace={trace} />
        ) : (
          <p className="text-sm text-muted-foreground">This trace source has no parts.</p>
        )}
      </div>
    </div>
  );
}
