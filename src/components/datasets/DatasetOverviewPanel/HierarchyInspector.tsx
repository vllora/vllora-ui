/**
 * HierarchyInspector
 *
 * Topic-hierarchy card from the Workflow Redesign mock. Left side: a
 * grouped, click-to-inspect tree with coverage bars + record counts and a
 * quality-status dot per row. Right side: a compact inspector panel for
 * the selected topic — breadcrumb, description, 4-tile metric grid,
 * linked source pills, and the lowest-scoring sample records.
 *
 * Pulls only from already-loaded contexts. No extra fetches.
 */

import { useMemo, useState, useCallback } from "react";
import { ChevronRight, FileText, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import type {
  DatasetRecord,
  TopicHierarchyNode,
} from "@/types/dataset-types";
import type { KnowledgeSource } from "@/types/knowledge-types";

interface HierarchyInspectorProps {
  hierarchy: readonly TopicHierarchyNode[];
  records: readonly DatasetRecord[];
  sources: readonly KnowledgeSource[];
  onOpenTopic?: (topicName: string) => void;
  onOpenRecord?: (recordId: string) => void;
}

type Status = "good" | "warn" | "problem" | "empty";

// ─── Public component ───────────────────────────────────────────────────────

export function HierarchyInspector({
  hierarchy,
  records,
  sources,
  onOpenTopic,
  onOpenRecord,
}: HierarchyInspectorProps) {
  const rows = useMemo(() => buildRows(hierarchy, records), [hierarchy, records]);
  const defaultLeafId = rows.find((r) => r.isLeaf)?.node.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(defaultLeafId);

  const selected = useMemo(
    () => rows.find((r) => r.node.id === selectedId) ?? rows.find((r) => r.isLeaf) ?? null,
    [rows, selectedId],
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Expand roots by default so the user sees one level of hierarchy at a glance.
    const initial = new Set<string>();
    for (const node of hierarchy) initial.add(node.id);
    return initial;
  });

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (hierarchy.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-zinc-900/40 px-4 py-6 text-center text-[12px] text-muted-foreground">
        No topic hierarchy yet. Generate topics from your sources to see the full structure here.
      </div>
    );
  }

  const visibleRows = rows.filter((r) =>
    r.ancestorIds.every((ancestorId) => expanded.has(ancestorId)),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-zinc-900/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
          Topic hierarchy
        </span>
        <span className="text-[11px] text-muted-foreground">
          · click to inspect — {rows.filter((r) => r.isLeaf).length} leaf topics
        </span>
      </div>
      <div className="grid grid-cols-1 divide-border/60 lg:grid-cols-[1fr_1.3fr] lg:divide-x">
        <div className="max-h-[420px] overflow-y-auto">
          {visibleRows.map((row) => (
            <HierarchyRow
              key={row.node.id}
              row={row}
              expanded={expanded.has(row.node.id)}
              selected={row.node.id === (selected?.node.id ?? null)}
              onToggle={() => handleToggle(row.node.id)}
              onSelect={() => setSelectedId(row.node.id)}
            />
          ))}
        </div>
        <div className="min-w-0">
          {selected ? (
            <TopicInspector
              row={selected}
              sources={sources}
              records={records}
              onOpenTopic={onOpenTopic}
              onOpenRecord={onOpenRecord}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-[12px] text-muted-foreground">
              Select a topic to inspect.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Hierarchy row ──────────────────────────────────────────────────────────

function HierarchyRow({
  row,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  readonly row: TopicRow;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
}) {
  const hasChildren = row.childCount > 0;
  const coveragePct = Math.round(row.coveragePercent);

  return (
    <div
      className={cn(
        "grid cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[12px] transition-colors last:border-b-0",
        selected ? "bg-emerald-500/[0.08]" : "hover:bg-muted/20",
      )}
      style={{ gridTemplateColumns: "1fr 120px 36px" }}
      onClick={onSelect}
    >
      <div
        className="flex min-w-0 items-center gap-1.5"
        style={{ paddingLeft: `${row.depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <StatusDot status={row.status} />
        <span
          className={cn(
            "truncate",
            selected ? "font-medium text-emerald-300" : "text-foreground/90",
          )}
        >
          {row.node.name}
        </span>
      </div>
      <div className="relative h-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn("h-full rounded-full", coverageBarClass(row.status))}
          style={{ width: `${coveragePct}%` }}
        />
      </div>
      <span
        className={cn(
          "text-right font-mono text-[11px] tabular-nums",
          selected ? "text-emerald-300" : "text-muted-foreground",
        )}
      >
        {row.recordCount}
      </span>
    </div>
  );
}

function StatusDot({ status }: { readonly status: Status }) {
  const cls =
    status === "problem"
      ? "bg-rose-400"
      : status === "warn"
        ? "bg-amber-400"
        : status === "empty"
          ? "bg-muted-foreground/40"
          : "bg-emerald-400";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cls)} />;
}

function coverageBarClass(status: Status): string {
  switch (status) {
    case "problem":
      return "bg-rose-400";
    case "warn":
      return "bg-amber-400";
    case "empty":
      return "bg-muted-foreground/40";
    default:
      return "bg-emerald-400";
  }
}

// ─── Topic inspector ───────────────────────────────────────────────────────

function TopicInspector({
  row,
  sources,
  records,
  onOpenTopic,
  onOpenRecord,
}: {
  readonly row: TopicRow;
  readonly sources: readonly KnowledgeSource[];
  readonly records: readonly DatasetRecord[];
  readonly onOpenTopic?: (topicName: string) => void;
  readonly onOpenRecord?: (recordId: string) => void;
}) {
  const grouped = useMemo(
    () => resolveAndGroupBySource(row.allRefs, sources),
    [row.allRefs, sources],
  );
  const sourcesCount = grouped.size;

  const topicRecords = useMemo(() => records.filter((r) => row.recordIds.has(r.id)), [records, row.recordIds]);
  const lowest = useMemo(() => {
    return topicRecords
      .map((r) => ({
        id: r.id,
        input: extractInput(r),
        score: pickScore(r),
      }))
      .filter((r) => r.score != null)
      .sort((a, b) => (a.score as number) - (b.score as number))
      .slice(0, 4);
  }, [topicRecords]);

  const partsCount = row.allRefs.length;
  const breadcrumb = row.breadcrumb.map(kebab).filter(Boolean).join(" / ");
  const displayScore = row.avgScore;

  return (
    <div className="flex h-full max-h-[420px] flex-col gap-3 overflow-y-auto px-4 py-3">
      <div>
        <div className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
          {row.node.name}
        </div>
        {breadcrumb && (
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{breadcrumb}</div>
        )}
      </div>
      {row.node.description && (
        <p className="text-[12px] leading-[1.55] text-foreground/85">{row.node.description}</p>
      )}

      <div className="grid grid-cols-4 gap-2">
        <MetricTile label="Records" value={row.recordCount} />
        <MetricTile
          label="Avg score"
          value={displayScore != null ? displayScore.toFixed(2) : "—"}
          valueClassName={scoreTone(displayScore)}
        />
        <MetricTile label="Sources" value={sourcesCount} />
        <MetricTile label="Parts" value={partsCount} />
      </div>

      {sourcesCount > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            Sources linked ({partsCount} part{partsCount === 1 ? "" : "s"})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...grouped.values()].flatMap(({ source, parts }) =>
              parts.map((part) => (
                <span
                  key={`${source.id}-${part.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-2 py-0.5 text-[11px] text-foreground/90"
                >
                  <FileText className="h-3 w-3 text-muted-foreground/60" />
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {sourceTypeBadge(source)}
                  </span>
                  <span className="truncate">{source.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {partLocator(part)}
                  </span>
                </span>
              )),
            )}
          </div>
        </div>
      )}

      {lowest.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            Sample records · lowest scoring first
          </div>
          <div className="flex flex-col gap-0.5">
            {lowest.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenRecord?.(r.id)}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-muted/30"
              >
                <span className="w-8 shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  #{shortRecordId(r.id)}
                </span>
                <span className="flex-1 truncate text-foreground/90">{r.input}</span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] tabular-nums",
                    scoreTone(r.score),
                  )}
                >
                  {r.score!.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {onOpenTopic && row.isLeaf && (
        <button
          type="button"
          onClick={() => onOpenTopic(row.node.name)}
          className="mt-auto inline-flex items-center justify-center gap-1.5 self-start rounded-md border border-border/60 bg-card/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
        >
          <Database className="h-3 w-3" />
          Open topic records →
        </button>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  valueClassName,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly valueClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 px-3 py-1.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-[15px] font-semibold tabular-nums",
          valueClassName ?? "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Row building ──────────────────────────────────────────────────────────

interface TopicRow {
  readonly node: TopicHierarchyNode;
  readonly depth: number;
  readonly ancestorIds: readonly string[];
  readonly breadcrumb: readonly string[];
  readonly isLeaf: boolean;
  readonly childCount: number;
  readonly recordCount: number;
  readonly recordIds: ReadonlySet<string>;
  readonly avgScore: number | null;
  readonly coveragePercent: number;
  readonly status: Status;
  readonly allRefs: readonly string[];
}

function buildRows(hierarchy: readonly TopicHierarchyNode[], records: readonly DatasetRecord[]): TopicRow[] {
  const rows: TopicRow[] = [];
  const recordsByTopic = new Map<string, DatasetRecord[]>();
  for (const r of records) {
    const key = r.topic ?? "";
    if (!key) continue;
    const bucket = recordsByTopic.get(key) ?? [];
    bucket.push(r);
    recordsByTopic.set(key, bucket);
  }

  const walk = (
    node: TopicHierarchyNode,
    depth: number,
    ancestorIds: readonly string[],
    breadcrumb: readonly string[],
  ) => {
    const isLeaf = !node.children || node.children.length === 0;
    const nodeRecords = collectDescendantRecords(node, recordsByTopic);
    const recordIds = new Set(nodeRecords.map((r) => r.id));
    const avgScore = computeAvgScore(nodeRecords);
    const allRefs = collectDescendantRefs(node);
    const status = computeStatus({ isLeaf, node, allRefs, avgScore });
    const coverageBase = isLeaf ? (allRefs.length > 0 ? 1 : 0) : descendantCoverage(node);
    rows.push({
      node,
      depth,
      ancestorIds,
      breadcrumb: [...breadcrumb, node.name],
      isLeaf,
      childCount: node.children?.length ?? 0,
      recordCount: nodeRecords.length,
      recordIds,
      avgScore,
      coveragePercent: coverageBase * 100,
      status,
      allRefs,
    });
    for (const child of node.children ?? []) {
      walk(child, depth + 1, [...ancestorIds, node.id], [...breadcrumb, node.name]);
    }
  };
  for (const root of hierarchy) walk(root, 0, [], []);
  return rows;
}

function collectDescendantRecords(
  node: TopicHierarchyNode,
  recordsByTopic: Map<string, DatasetRecord[]>,
): DatasetRecord[] {
  const out: DatasetRecord[] = [];
  const walk = (n: TopicHierarchyNode) => {
    const matches = recordsByTopic.get(n.name) ?? [];
    out.push(...matches);
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

function collectDescendantRefs(node: TopicHierarchyNode): string[] {
  const refs = new Set<string>();
  const walk = (n: TopicHierarchyNode) => {
    for (const r of n.sourceChunkRefs ?? []) refs.add(r);
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return [...refs];
}

function descendantCoverage(node: TopicHierarchyNode): number {
  let total = 0;
  let covered = 0;
  const walk = (n: TopicHierarchyNode) => {
    const isLeaf = !n.children || n.children.length === 0;
    if (isLeaf) {
      total += 1;
      if ((n.sourceChunkRefs?.length ?? 0) > 0) covered += 1;
    } else {
      for (const child of n.children ?? []) walk(child);
    }
  };
  walk(node);
  return total === 0 ? 0 : covered / total;
}

function computeAvgScore(records: readonly DatasetRecord[]): number | null {
  const scores = records.map(pickScore).filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function computeStatus({
  isLeaf,
  node,
  allRefs,
  avgScore,
}: {
  isLeaf: boolean;
  node: TopicHierarchyNode;
  allRefs: readonly string[];
  avgScore: number | null;
}): Status {
  if (isLeaf && allRefs.length === 0) return "empty";
  if (avgScore == null) return node.sourceChunkRefs || allRefs.length > 0 ? "good" : "warn";
  if (avgScore < 0.5) return "problem";
  if (avgScore < 0.75) return "warn";
  return "good";
}

// ─── Utils ─────────────────────────────────────────────────────────────────

function pickScore(record: DatasetRecord): number | null {
  const ev = record.evaluation;
  if (!ev) return null;
  const candidate = ev.dryRunAvg ?? ev.evalScore ?? ev.score;
  return typeof candidate === "number" ? candidate : null;
}

function scoreTone(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 0.8) return "text-emerald-300";
  if (score >= 0.6) return "text-amber-400";
  return "text-rose-300";
}

function extractInput(record: DatasetRecord): string {
  const d = record.data as Record<string, unknown> | undefined;
  const msgs = (Array.isArray(d?.messages)
    ? d?.messages
    : (d?.input as Record<string, unknown> | undefined)?.messages) as
    | Array<{ role?: string; content?: string }>
    | undefined;
  const user = msgs?.find((m) => m.role === "user");
  if (typeof user?.content === "string") return user.content.replace(/\s+/g, " ").slice(0, 120);
  return "(no user message)";
}

function shortRecordId(id: string): string {
  const clean = id.replace(/-/g, "");
  return clean.slice(0, 5);
}

function kebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function sourceTypeBadge(source: { type?: string; name?: string }): string {
  const name = (source.name ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".tsv")) return "TBL";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "MD";
  if (source.type === "trace") return "TRACE";
  return (source.type ?? "DOC").slice(0, 4).toUpperCase();
}

function partLocator(part: { title?: string; extractionPath?: string }): string {
  // Prefer a page-ref style (`p.12-14`) if extractionPath hints at one; fall
  // back to a truncated title.
  const hint = part.extractionPath ?? part.title ?? "";
  const pageMatch = hint.match(/p\.?\s*\d+[-–]?\d*/i);
  if (pageMatch) return pageMatch[0].replace(/\s+/g, "");
  return (part.title ?? "part").slice(0, 14);
}
