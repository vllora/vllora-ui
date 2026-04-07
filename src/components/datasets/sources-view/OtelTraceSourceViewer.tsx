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
import { Badge } from '@/components/ui/badge';
import { MessageSquare } from 'lucide-react';
import type { KnowledgeSource } from '@/types/knowledge-types';
import type {
  OtelMessage,
  OtelMessagePart,
  OtelMessageRole,
  OtelSpan,
  OtelTrace,
} from '@/types/otel-trace-types';

interface OtelTraceSourceViewerProps {
  readonly source: KnowledgeSource;
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

export function OtelTraceSourceViewer({ source }: OtelTraceSourceViewerProps) {
  const trace = sourceToTrace(source);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-violet-500/15 p-2 text-violet-300">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{source.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                OTel trace
              </Badge>
              <span>{source.parts.length} parts</span>
              {source.description && <span>· {source.description}</span>}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {trace ? (
          <OtelTraceMessageTimeline trace={trace} />
        ) : (
          <p className="text-sm text-muted-foreground">This trace source has no parts.</p>
        )}
      </div>
    </div>
  );
}
