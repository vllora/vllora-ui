/**
 * OtelTraceDetailPane
 *
 * Detail pane of the master-detail OTel trace browser. Renders:
 *   - top: our own header chips (model, tokens, latency, conversation, status)
 *          plus the "Use as finetune input" CTA
 *   - middle: agent-prism's TreeView (left) showing the span tree
 *   - bottom: agent-prism's DetailsView (right of tree, stacked here for
 *             vertical compactness) showing attributes / input-output / raw
 *
 * Selection state for the inner span tree is owned by the parent shell so
 * the URL stays the source of truth for which TRACE is shown, while inside
 * a trace the user picks a span freely.
 */

import { X, Sparkles } from 'lucide-react';
import type { TraceSpan } from '@evilmartians/agent-prism-types';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

import { TreeView } from '@/components/agent-prism/TreeView';
import { DetailsView } from '@/components/agent-prism/DetailsView/DetailsView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { OtelUseAsFinetuneInputSheet } from './OtelUseAsFinetuneInputSheet';
import type { OtelTrace } from '@/types/otel-trace-types';
import type { AgentPrismTraceData } from '@/services/adapters/otel-to-agent-prism';

interface OtelTraceDetailPaneProps {
  readonly trace: OtelTrace;
  readonly adapted: AgentPrismTraceData;
  readonly selectedSpan: TraceSpan | undefined;
  readonly expandedSpansIds: string[];
  readonly onSelectSpan: (span: TraceSpan) => void;
  readonly onExpandedSpansIdsChange: (ids: string[]) => void;
  readonly onClose: () => void;
}

export function OtelTraceDetailPane({
  trace,
  adapted,
  selectedSpan,
  expandedSpansIds,
  onSelectSpan,
  onExpandedSpansIdsChange,
  onClose,
}: OtelTraceDetailPaneProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const root = trace.rootSpan;

  // Compact subline: prefer agent name, then conversation id, then provider.
  const subline =
    root.agentName ??
    trace.conversationId ??
    [root.providerName, root.requestModel].filter(Boolean).join(' · ');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header — minimal: name, subline, CTA, close ── */}
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{root.name}</h2>
          {subline && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subline}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {root.status === 'error' && (
            <Badge variant="destructive" className="text-[10px]">
              error
            </Badge>
          )}
          <Button size="sm" onClick={() => setSheetOpen(true)} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Use as finetune input
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Inner split: span tree (left) + selected span details (right) ──
          Mirrors agent-prism's own TraceViewer 3-pane layout. Side-by-side
          gives both regions room to breathe; the single-span case stops
          looking broken because the tree column is narrow on purpose and
          the details column expands to use the remaining width. */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={36} minSize={22} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-card/20 py-2">
              <TreeView
                spans={adapted.spans}
                selectedSpan={selectedSpan}
                onSpanSelect={onSelectSpan}
                expandedSpansIds={expandedSpansIds}
                onExpandSpansIdsChange={onExpandedSpansIdsChange}
              />
            </div>
          </Panel>
          <PanelResizeHandle className="w-px bg-border/60 transition-colors hover:bg-border" />
          <Panel defaultSize={64} minSize={40} className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              {selectedSpan ? (
                <DetailsView data={selectedSpan} />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">
                  Pick a span on the left to see attributes and content.
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <OtelUseAsFinetuneInputSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        traceIds={[trace.traceId]}
      />
    </div>
  );
}
