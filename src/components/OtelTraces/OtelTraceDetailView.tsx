/**
 * TraceDetailView
 *
 * Single-trace viewer. Header shows model / provider / token / latency
 * chips; main column is the message timeline; right rail is a raw OTel
 * span tree for power users. Primary CTA is "Use this trace as finetune
 * input" which opens UseAsFinetuneInputSheet.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useRequest } from 'ahooks';
import { ArrowLeft, Sparkles, Clock, Cpu, Hash, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { otelTraceService } from '@/services/service-registry';
import { OtelTraceMessageTimeline } from './OtelTraceMessageTimeline';
import { OtelUseAsFinetuneInputSheet } from './OtelUseAsFinetuneInputSheet';
import type { OtelSpan, OtelTrace } from '@/types/otel-trace-types';

export function OtelTraceDetailView() {
  const { traceId = '' } = useParams<{ traceId: string }>();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: trace, loading } = useRequest(() => otelTraceService.get(traceId), {
    refreshDeps: [traceId],
  });

  if (loading) {
    return <div className="p-12 text-sm text-muted-foreground">Loading trace…</div>;
  }
  if (!trace) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-muted-foreground">Trace not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/otel-traces')}>
          Back to traces
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <DetailHeader trace={trace} onBack={() => navigate('/otel-traces')} onUse={() => setSheetOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <OtelTraceMessageTimeline trace={trace} />
        </main>
        <aside className="hidden w-[340px] shrink-0 overflow-auto border-l border-border/60 bg-card/30 p-4 lg:block">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Span tree
          </h3>
          <SpanTree spans={trace.spans} />
        </aside>
      </div>

      <OtelUseAsFinetuneInputSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        traceIds={[trace.traceId]}
      />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function DetailHeader({
  trace,
  onBack,
  onUse,
}: {
  trace: OtelTrace;
  onBack: () => void;
  onUse: () => void;
}) {
  const root = trace.rootSpan;
  return (
    <header className="border-b border-border/60 px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Traces
        </Button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{root.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{trace.traceId}</p>
        </div>
        <Button onClick={onUse} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Use as finetune input
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {root.requestModel && (
          <HeaderChip icon={<Cpu className="h-3 w-3" />} label={root.requestModel} />
        )}
        {root.providerName && <HeaderChip label={root.providerName} />}
        {trace.totalTokens !== undefined && (
          <HeaderChip
            icon={<Hash className="h-3 w-3" />}
            label={`${trace.totalTokens.toLocaleString()} tokens`}
          />
        )}
        <HeaderChip
          icon={<Clock className="h-3 w-3" />}
          label={`${root.durationMs.toLocaleString()}ms`}
        />
        {trace.toolCallCount > 0 && (
          <HeaderChip
            icon={<Wrench className="h-3 w-3" />}
            label={`${trace.toolCallCount} tool call${trace.toolCallCount === 1 ? '' : 's'}`}
          />
        )}
        {trace.conversationId && (
          <HeaderChip label={trace.conversationId} className="font-mono" />
        )}
        {root.agentName && <HeaderChip label={`agent: ${root.agentName}`} />}
        {root.status === 'error' && (
          <Badge variant="destructive" className="text-xs">
            error{root.statusMessage ? `: ${root.statusMessage}` : ''}
          </Badge>
        )}
      </div>
    </header>
  );
}

function HeaderChip({
  icon,
  label,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${className ?? ''}`}>
      {icon}
      {label}
    </Badge>
  );
}

// ─── Span tree (right rail) ──────────────────────────────────────────────────

function SpanTree({ spans }: { spans: OtelSpan[] }) {
  const byParent = new Map<string | undefined, OtelSpan[]>();
  for (const s of spans) {
    const arr = byParent.get(s.parentSpanId) ?? [];
    arr.push(s);
    byParent.set(s.parentSpanId, arr);
  }
  const roots = byParent.get(undefined) ?? [];
  return (
    <ul className="space-y-1 text-xs">
      {roots.map((r) => (
        <SpanNode key={r.spanId} span={r} byParent={byParent} depth={0} />
      ))}
    </ul>
  );
}

function SpanNode({
  span,
  byParent,
  depth,
}: {
  span: OtelSpan;
  byParent: Map<string | undefined, OtelSpan[]>;
  depth: number;
}) {
  const children = byParent.get(span.spanId) ?? [];
  return (
    <li>
      <div
        className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-accent/30"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="truncate">
          <span className="font-mono text-[10px] text-muted-foreground">
            {span.operationName}
          </span>{' '}
          <span className="font-medium">{span.toolName ?? span.requestModel ?? span.name}</span>
        </span>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {span.durationMs}ms
        </span>
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <SpanNode key={c.spanId} span={c} byParent={byParent} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
