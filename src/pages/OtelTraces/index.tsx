/**
 * OtelTracesPage
 *
 * Single-route master-detail browser for OTel GenAI traces.
 *
 *   left pane:  our filterable table (filter == selection, Langfuse-style)
 *   right pane: agent-prism's polished TreeView + DetailsView, showing
 *               whichever trace is currently selected via `?trace=<id>`
 *
 * The previous two-route layout (`/otel-traces` + `/otel-traces/:traceId`)
 * was collapsed into one because master-detail is the standard observability
 * UX (Phoenix, Langfuse, Jaeger all do this) and lets users cycle through
 * traces without losing list context.
 *
 * Selection state lives in the URL query string so deep-links still work:
 *   /otel-traces                → no selection (right pane is empty state)
 *   /otel-traces?trace=<id>     → that trace shown in the right pane
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRequest } from 'ahooks';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Waypoints } from 'lucide-react';
import type { TraceSpan } from '@evilmartians/agent-prism-types';
import { flattenSpans } from '@evilmartians/agent-prism-data';

import { OtelTracesProvider, OtelTracesConsumer } from '@/contexts/OtelTracesContext';
import { OtelTraceFilterBar } from '@/components/OtelTraces/OtelTraceFilterBar';
import { OtelTraceListPane } from '@/components/OtelTraces/OtelTraceListPane';
import { OtelTraceDetailPane } from '@/components/OtelTraces/OtelTraceDetailPane';
import { otelTraceService } from '@/services/service-registry';
import { otelTraceToAgentPrism } from '@/services/adapters/otel-to-agent-prism';

export function OtelTracesPage() {
  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground">
      <OtelTracesProvider>
        <OtelTracesShell />
      </OtelTracesProvider>
    </section>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

function OtelTracesShell() {
  const { traces } = OtelTracesConsumer();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTraceId = searchParams.get('trace');

  // Selection helpers — selecting a trace updates the URL.
  const selectTrace = (traceId: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (traceId) next.set('trace', traceId);
        else next.delete('trace');
        return next;
      },
      { replace: true },
    );
  };

  // Auto-clear selection if the selected id no longer matches a filtered trace.
  useEffect(() => {
    if (!selectedTraceId) return;
    if (!traces.some((t) => t.traceId === selectedTraceId)) {
      selectTrace(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces, selectedTraceId]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Page header — tight, single line ── */}
      <header className="flex items-baseline justify-between gap-4 border-b border-border/60 px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">OTel Traces</h1>
        <p className="hidden text-xs text-muted-foreground md:block">
          OpenTelemetry GenAI traces — browse, inspect, and turn into finetune inputs
        </p>
      </header>

      <OtelTraceFilterBar />

      {/* ── Master / Detail split ── */}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={42} minSize={28} className="flex flex-col overflow-hidden">
          <OtelTraceListPane
            selectedTraceId={selectedTraceId}
            onSelectTrace={selectTrace}
          />
        </Panel>
        <PanelResizeHandle className="w-px bg-border/60 transition-colors hover:bg-border" />
        <Panel defaultSize={58} minSize={36} className="flex flex-col overflow-hidden">
          {selectedTraceId ? (
            <SelectedTracePane
              traceId={selectedTraceId}
              onClear={() => selectTrace(null)}
            />
          ) : (
            <DetailEmptyState />
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
}

// ─── Detail pane wrapper ────────────────────────────────────────────────────

function SelectedTracePane({
  traceId,
  onClear,
}: {
  traceId: string;
  onClear: () => void;
}) {
  const { data: trace, loading } = useRequest(() => otelTraceService.get(traceId), {
    refreshDeps: [traceId],
  });

  // agent-prism conversion + selection state for the inner DetailsView.
  const adapted = useMemo(() => (trace ? otelTraceToAgentPrism(trace) : null), [trace]);
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | undefined>(undefined);
  const [expandedSpansIds, setExpandedSpansIds] = useState<string[]>([]);

  // Reset inner state when the trace changes; default-select the root span
  // and expand the whole tree so users see content immediately.
  useEffect(() => {
    if (!adapted) {
      setSelectedSpan(undefined);
      setExpandedSpansIds([]);
      return;
    }
    const allIds = adapted.spans.flatMap((s) => flattenSpans([s])).map((s) => s.id);
    setExpandedSpansIds(allIds);
    setSelectedSpan(adapted.spans[0]);
  }, [adapted]);

  if (loading || !trace || !adapted) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Loading trace…
      </div>
    );
  }

  return (
    <OtelTraceDetailPane
      trace={trace}
      adapted={adapted}
      selectedSpan={selectedSpan}
      expandedSpansIds={expandedSpansIds}
      onSelectSpan={setSelectedSpan}
      onExpandedSpansIdsChange={setExpandedSpansIds}
      onClose={onClear}
    />
  );
}

// ─── Empty state for the right pane ─────────────────────────────────────────

function DetailEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="rounded-full bg-muted p-3">
        <Waypoints className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">Pick a trace from the list</p>
      <p className="max-w-xs text-xs">
        Click any row on the left to see the full span tree, attributes, and prompts /
        responses for that trace.
      </p>
    </div>
  );
}
