/**
 * AgentPrismMomentLayout
 *
 * Composes agent-prism's primitives (`TraceList` + `TreeView`) with our own
 * `MomentPane` in place of agent-prism's `DetailsView`. This is the
 * composition-based customization path agent-prism documents in its README:
 * for fine-grained control, mount the building blocks directly and manage
 * the selection state yourself.
 *
 * Layout (desktop):
 *   ┌────────┬───────────────────────────────────┐
 *   │ Trace  │  TreeView (flamegraph)            │
 *   │ List   │                                   │
 *   │        ├───────────────────────────────────┤
 *   │        │  MomentPane (prompt + completion  │
 *   │        │  + trace→records linkage)         │
 *   └────────┴───────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { TraceRecord, TraceSpan } from "@evilmartians/agent-prism-types";
import { flattenSpans } from "@evilmartians/agent-prism-data";
import { TreeView } from "@/components/agent-prism/TreeView";
import { DetailsView } from "@/components/agent-prism/DetailsView/DetailsView";
import { cn } from "@/lib/utils";
import { Sparkles, Layers } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import type { OtelSemconvSpan } from "../OtelTraceSourceViewer";
import { MomentPane } from "./MomentPane";
import { MomentTraceList } from "./MomentTraceList";
import { detectMomentFromSpans } from "./moment";

export interface PrismTrace {
  readonly traceRecord: TraceRecord;
  readonly spans: TraceSpan[];
}

interface AgentPrismMomentLayoutProps {
  readonly data: readonly PrismTrace[];
  readonly rawSpans: readonly OtelSemconvSpan[];
}

/**
 * Wraps agent-prism's `<TreeView>` with a scoped CSS rule that highlights
 * the moment-producing span — the leaf LLM span the distiller treats as
 * the training-signal anchor. Agent-prism uses `aria-describedby=
 * "span-card-desc-<id>"` on each span row, so we target by that + a
 * unique wrapper class to avoid bleed across instances.
 */
interface FlamegraphWithMomentProps {
  readonly selectedSpans: TraceSpan[];
  readonly rawSpans: readonly OtelSemconvSpan[];
  readonly selectedTraceId: string | undefined;
  readonly selectedSpan: TraceSpan | undefined;
  readonly setSelectedSpan: (span: TraceSpan | undefined) => void;
  readonly expandedSpansIds: string[];
  readonly setExpandedSpansIds: (ids: string[]) => void;
}

function FlamegraphWithMoment({
  selectedSpans,
  rawSpans,
  selectedTraceId,
  selectedSpan,
  setSelectedSpan,
  expandedSpansIds,
  setExpandedSpansIds,
}: FlamegraphWithMomentProps) {
  const momentSpanId = useMemo(() => {
    if (!selectedTraceId) return null;
    const traceSpans = rawSpans.filter((s) => s.trace_id === selectedTraceId);
    return detectMomentFromSpans(traceSpans)?.spanId ?? null;
  }, [rawSpans, selectedTraceId]);

  // Escape CSS special chars in the span id (UUIDs with hyphens are fine, but
  // let's be defensive for non-UUID ids like "span-0").
  const safeId = momentSpanId?.replace(/"/g, '\\"');

  return (
    <div className="flame-wrap relative h-full overflow-y-auto py-3">
      <style>{`
        /* Make agent-prism's selection visible. Its default is a very
           subtle gradient that users miss — swap for a violet left-edge +
           stronger bg tint, matching the mock's selection accent color. */
        .flame-wrap [role="button"][aria-pressed="true"] {
          background: rgba(167, 139, 250, 0.08) !important;
          box-shadow: inset 2px 0 0 0 #a78bfa !important;
        }
        ${safeId ? `
          /* Repaint the timeline bar emerald on the moment-producing span
             so it's distinguishable from ordinary spans. Selection uses
             violet; moment uses emerald — two different cues. */
          .flame-wrap [aria-describedby="span-card-desc-${safeId}"] [class*="bg-agentprism-timeline"] {
            background: oklch(0.66 0.15 162) !important;
            box-shadow:
              0 0 0 1px oklch(0.82 0.17 160) inset,
              0 0 10px oklch(0.66 0.15 162 / 0.35) !important;
          }
          /* Emerald duration label on the moment row to match the bar. */
          .flame-wrap [aria-describedby="span-card-desc-${safeId}"] .text-agentprism-foreground.inline-block.w-14 {
            color: oklch(0.82 0.17 160) !important;
          }
        ` : ""}
      `}</style>
      <TreeView
        spans={selectedSpans}
        onSpanSelect={setSelectedSpan}
        selectedSpan={selectedSpan}
        expandedSpansIds={expandedSpansIds}
        onExpandSpansIdsChange={setExpandedSpansIds}
      />
    </div>
  );
}

type BottomTab = "moment" | "span";

interface RightPaneProps {
  readonly selectedTraceId: string | undefined;
  readonly selectedSpan: TraceSpan | undefined;
  readonly rawSpans: readonly OtelSemconvSpan[];
  readonly records: readonly import("@/types/dataset-types").DatasetRecord[];
}

/**
 * Tab bar + content for the bottom pane. Default view is the auto-detected
 * Moment — the span the distiller treats as the training-signal anchor.
 * Selecting a span in the flamegraph flips to the Span-details tab
 * (agent-prism's `DetailsView`) so users can inspect arbitrary spans
 * without losing the moment view.
 */
function RightPane({ selectedTraceId, selectedSpan, rawSpans, records }: RightPaneProps) {
  const traceSpans = useMemo(
    () => (selectedTraceId ? rawSpans.filter((s) => s.trace_id === selectedTraceId) : []),
    [rawSpans, selectedTraceId],
  );
  const moment = useMemo(() => detectMomentFromSpans(traceSpans), [traceSpans]);

  const [manualTab, setManualTab] = useState<BottomTab | null>(null);
  const previousSpanIdRef = useMemo(() => ({ current: undefined as string | undefined }), []);

  useEffect(() => {
    const spanId = selectedSpan?.id;
    if (spanId === previousSpanIdRef.current) return;
    previousSpanIdRef.current = spanId;
    // Switch tabs automatically when user picks a different span in the tree.
    if (spanId && spanId !== moment?.spanId) {
      setManualTab("span");
    } else if (!spanId) {
      setManualTab(null);
    }
  }, [selectedSpan, moment, previousSpanIdRef]);

  const tab: BottomTab = manualTab ?? "moment";

  if (!selectedTraceId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a trace to see its moment.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <TabButton
          active={tab === "moment"}
          onClick={() => setManualTab("moment")}
          icon={<Sparkles className="h-3 w-3" />}
          label="Moment"
        />
        <TabButton
          active={tab === "span"}
          disabled={!selectedSpan}
          onClick={() => setManualTab("span")}
          icon={<Layers className="h-3 w-3" />}
          label={selectedSpan ? `Span · ${selectedSpan.title}` : "Span details"}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "moment" ? (
          <MomentPane
            traceId={selectedTraceId}
            spans={rawSpans}
            records={records}
          />
        ) : selectedSpan ? (
          <div className="details-view-wrap h-full overflow-hidden">
            <DetailsView data={selectedSpan} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Click a span in the flamegraph to inspect it.
          </div>
        )}
      </div>
    </>
  );
}

interface TabButtonProps {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly label: string;
}

function TabButton({ active, disabled, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-emerald-500/15 text-emerald-200"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {icon}
      <span className="truncate max-w-[220px]">{label}</span>
    </button>
  );
}

export function AgentPrismMomentLayout({ data, rawSpans }: AgentPrismMomentLayoutProps) {
  const { records } = DatasetDetailConsumer();

  const traces = useMemo(() => data.map((d) => d.traceRecord), [data]);

  const [selectedTraceId, setSelectedTraceId] = useState<string | undefined>(
    traces[0]?.id,
  );
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | undefined>();

  const selectedEntry = useMemo(
    () => data.find((d) => d.traceRecord.id === selectedTraceId),
    [data, selectedTraceId],
  );
  const selectedSpans = selectedEntry?.spans ?? [];

  const allIds = useMemo(
    () => flattenSpans(selectedSpans).map((s) => s.id),
    [selectedSpans],
  );
  const [expandedSpansIds, setExpandedSpansIds] = useState<string[]>(allIds);

  useEffect(() => {
    setExpandedSpansIds(allIds);
  }, [allIds]);

  // Don't auto-select the first span on load — the mock's default surface
  // is the Moment, not span details. The Span tab becomes active only after
  // the user explicitly clicks a span in the tree.

  const handleTraceSelect = useCallback((trace: TraceRecord) => {
    setSelectedTraceId(trace.id);
    setSelectedSpan(undefined);
  }, []);

  return (
    <div className="agent-prism-wrapper h-full">
      <PanelGroup direction="horizontal" className="h-full">
        <Panel
          id="trace-list"
          defaultSize={22}
          minSize={16}
          maxSize={38}
          className="flex h-full min-h-0 flex-col overflow-hidden"
        >
          <MomentTraceList
            rawSpans={rawSpans}
            selectedTraceId={selectedTraceId}
            onTraceSelect={(id) => handleTraceSelect(
              traces.find((t) => t.id === id) ?? ({ id } as TraceRecord),
            )}
          />
        </Panel>

        <PanelResizeHandle />

        <Panel
          id="flamegraph"
          minSize={30}
          className="bg-agentprism-background h-full min-h-0 overflow-hidden"
        >
          {selectedSpans.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
              Select a trace to see its flamegraph.
            </div>
          ) : (
            <FlamegraphWithMoment
              selectedSpans={selectedSpans}
              rawSpans={rawSpans}
              selectedTraceId={selectedTraceId}
              selectedSpan={selectedSpan}
              setSelectedSpan={setSelectedSpan}
              expandedSpansIds={expandedSpansIds}
              setExpandedSpansIds={setExpandedSpansIds}
            />
          )}
        </Panel>

        <PanelResizeHandle />

        <Panel
          id="moment-pane"
          defaultSize={32}
          minSize={22}
          maxSize={50}
          className="bg-agentprism-background h-full min-h-0 border-l border-border/60 flex flex-col overflow-hidden"
        >
          <RightPane
            selectedTraceId={selectedTraceId}
            selectedSpan={selectedSpan}
            rawSpans={rawSpans}
            records={records}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
