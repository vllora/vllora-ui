/**
 * OtelTraceListPane
 *
 * Master pane of the master-detail OTel trace browser. Renders the
 * filtered trace rows from `OtelTracesContext`. Selection lives in the
 * URL — clicking a row calls `onSelectTrace` which patches `?trace=<id>`.
 *
 * This is a stripped-down rewrite of the old standalone `OtelTraceListView`
 * (which had its own page header/footer/CTA). The shell now owns those
 * chrome elements; this component just renders the table body.
 */

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
import { OtelUseAsFinetuneInputSheet } from './OtelUseAsFinetuneInputSheet';
import type { OtelTrace } from '@/types/otel-trace-types';

interface OtelTraceListPaneProps {
  readonly selectedTraceId: string | null;
  readonly onSelectTrace: (traceId: string) => void;
}

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

export function OtelTraceListPane({
  selectedTraceId,
  onSelectTrace,
}: OtelTraceListPaneProps) {
  const { traces, total, hasLoaded, loading } = OtelTracesConsumer();
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);

  if (!hasLoaded || loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
        Loading traces…
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="rounded-full bg-muted p-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-medium">No traces match your filters</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Adjust the filter bar above, or have your app send OpenTelemetry GenAI traces to
          vLLora to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Conversation</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Turns</TableHead>
              <TableHead className="text-right">Tools</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map((trace) => (
              <OtelTraceRow
                key={trace.traceId}
                trace={trace}
                selected={trace.traceId === selectedTraceId}
                onClick={() => onSelectTrace(trace.traceId)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/30 px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{traces.length}</span> of {total} traces
        </span>
        <Button size="sm" onClick={() => setBulkSheetOpen(true)} className="h-7 gap-1.5 px-3 text-xs">
          <Sparkles className="h-3 w-3" />
          Use {traces.length} as finetune input
        </Button>
      </footer>

      <OtelUseAsFinetuneInputSheet
        open={bulkSheetOpen}
        onOpenChange={setBulkSheetOpen}
        traceIds={traces.map((t) => t.traceId)}
      />
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function OtelTraceRow({
  trace,
  selected,
  onClick,
}: {
  trace: OtelTrace;
  selected: boolean;
  onClick: () => void;
}) {
  const root = trace.rootSpan;
  return (
    <TableRow
      className={cn(
        'cursor-pointer transition-colors',
        selected
          ? 'bg-[rgba(var(--theme-500),0.12)] hover:bg-[rgba(var(--theme-500),0.16)]'
          : 'hover:bg-accent/30',
      )}
      onClick={onClick}
    >
      <TableCell className="text-xs text-muted-foreground">
        {formatRelative(root.startTime)}
      </TableCell>
      <TableCell className="max-w-[200px] truncate font-mono text-xs">
        {trace.conversationId ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{root.requestModel ?? '—'}</div>
        {root.providerName && (
          <div className="text-muted-foreground">{root.providerName}</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">{trace.turnCount}</TableCell>
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
