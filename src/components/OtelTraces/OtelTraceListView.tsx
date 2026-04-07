/**
 * OtelTraceListView
 *
 * Langfuse-style table of OTel GenAI traces. Filter bar drives selection
 * (filter == selection). The footer surfaces the bulk "Use as finetune
 * input" CTA against the currently filtered set.
 *
 * Otel-prefixed to disambiguate from the legacy vLLora `traces/` UI in
 * `src/components/traces/` and `src/pages/chat/traces/`.
 */

import { useNavigate } from 'react-router';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wrench, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OtelTracesConsumer } from '@/contexts/OtelTracesContext';
import { OtelTraceFilterBar } from './OtelTraceFilterBar';
import { OtelUseAsFinetuneInputSheet } from './OtelUseAsFinetuneInputSheet';
import type { OtelTrace } from '@/types/otel-trace-types';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

function formatTokens(n?: number): string {
  if (!n) return '—';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function OtelTraceListView() {
  const { traces, total, hasLoaded, loading } = OtelTracesConsumer();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTraceIds, setSheetTraceIds] = useState<string[]>([]);
  const navigate = useNavigate();

  const openBulkSheet = () => {
    setSheetTraceIds(traces.map((t) => t.traceId));
    setSheetOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Traces</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              OpenTelemetry GenAI traces from your apps. Browse, inspect, and turn the ones
              you like into finetune training inputs.
            </p>
          </div>
        </div>
      </header>

      <OtelTraceFilterBar />

      <div className="flex-1 overflow-auto">
        {!hasLoaded || loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading traces…</div>
        ) : traces.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Conversation</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Turns</TableHead>
                <TableHead className="text-right">Tools</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map((trace) => (
                <OtelTraceRow key={trace.traceId} trace={trace} onOpen={(id) => navigate(`/otel-traces/${id}`)} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {traces.length > 0 && (
        <footer className="flex items-center justify-between border-t border-border/60 bg-card/30 px-6 py-3">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{traces.length}</span> of {total} traces
          </div>
          <Button onClick={openBulkSheet} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Use {traces.length} traces as finetune input
          </Button>
        </footer>
      )}

      <OtelUseAsFinetuneInputSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        traceIds={sheetTraceIds}
      />
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function OtelTraceRow({ trace, onOpen }: { trace: OtelTrace; onOpen: (id: string) => void }) {
  const root = trace.rootSpan;
  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/30"
      onClick={() => onOpen(trace.traceId)}
    >
      <TableCell className="text-xs text-muted-foreground">
        {formatRelative(root.startTime)}
      </TableCell>
      <TableCell className="max-w-[260px] truncate font-mono text-xs">
        {trace.conversationId ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{root.requestModel ?? '—'}</div>
        {root.providerName && (
          <div className="text-muted-foreground">{root.providerName}</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="inline-flex items-center gap-1 text-xs">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
          {trace.turnCount}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {trace.toolCallCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <Wrench className="h-3 w-3 text-muted-foreground" />
            {trace.toolCallCount}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">
        {formatTokens(trace.totalTokens)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">
        {root.durationMs.toLocaleString()}ms
      </TableCell>
      <TableCell>
        <Badge
          variant={root.status === 'error' ? 'destructive' : 'secondary'}
          className={cn('text-xs', root.status === 'ok' && 'bg-emerald-500/15 text-emerald-300')}
        >
          {root.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium">No traces match your filters</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Adjust the filter bar above, or have your app send OpenTelemetry GenAI traces to vLLora to
        get started.
      </p>
    </div>
  );
}
