/**
 * UnifiedRecordTable
 *
 * Single `<table>` layout with 3 row types:
 * - Parent group header row (collapsible, aggregated stats)
 * - Subgroup header row (topic name, score, source count)
 * - Record row (input, output, score pill, source ref)
 *
 * Replaces per-group separate tables with one unified view.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { extractMessages, cleanText } from "./cells/ConversationThreadCell.utilities";
import { emitter } from "@/utils/eventEmitter";

// ─── Types ───

type DisplayRow =
  | { type: "parent"; node: TopicHierarchyNode; depth: number; recordCount: number; avgScore: number; coveragePct: number }
  | { type: "subgroup"; node: TopicHierarchyNode; depth: number; recordCount: number; avgScore: number; sourceCount: number }
  | { type: "record"; record: DatasetRecord; depth: number; parentTopic: string };

export interface UnifiedRecordTableProps {
  readonly hierarchy: TopicHierarchyNode[];
  readonly records: readonly DatasetRecord[];
  readonly searchQuery: string;
  readonly topicFilter: string;
  readonly scoreFilter: string;
  readonly onExpand?: (record: DatasetRecord) => void;
}

// ─── Helpers ───

function getRecordScore(record: DatasetRecord): number | undefined {
  return record.evaluation?.score ?? record.evaluation?.evalScore;
}

function extractRecordText(record: DatasetRecord): { userText: string; assistantText: string } {
  const msgs = extractMessages(record.data).filter(
    (m) => m.role.toLowerCase() !== "system",
  );
  const userMsg = msgs.find((m) => {
    const r = m.role.toLowerCase();
    return r === "user" || r === "human";
  });
  const assistantMsg = msgs.find((m) => {
    const r = m.role.toLowerCase();
    return r === "assistant" || r === "ai" || r === "model";
  });

  return {
    userText: userMsg ? cleanText(userMsg.content) : (msgs[0] ? cleanText(msgs[0].content) : ""),
    assistantText: assistantMsg ? cleanText(assistantMsg.content) : "",
  };
}

function getSourceRef(record: DatasetRecord): string | null {
  const meta = record.metadata as Record<string, unknown> | undefined;
  const ref = meta?.sourceChunkRef;
  if (typeof ref === "string") return ref;
  return null;
}

// ─── Component ───

export function UnifiedRecordTable({
  hierarchy,
  records,
  searchQuery,
  topicFilter,
  scoreFilter,
  onExpand,
}: UnifiedRecordTableProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Group records by topic
  const recordsByTopic = useMemo(() => {
    const map = new Map<string, DatasetRecord[]>();
    for (const record of records) {
      const topic = record.topic || "__unassigned__";
      const existing = map.get(topic) ?? [];
      map.set(topic, [...existing, record]);
    }
    return map;
  }, [records]);

  // Compute per-topic stats
  const topicStats = useMemo(() => {
    const stats = new Map<string, { count: number; avgScore: number; sourceCount: number }>();

    const computeForNode = (node: TopicHierarchyNode): { count: number; totalScore: number; scoredCount: number } => {
      const nodeRecords = recordsByTopic.get(node.name) ?? recordsByTopic.get(node.id) ?? [];
      let count = nodeRecords.length;
      let totalScore = 0;
      let scoredCount = 0;

      for (const r of nodeRecords) {
        const s = getRecordScore(r);
        if (s !== undefined) {
          totalScore += s;
          scoredCount++;
        }
      }

      if (node.children) {
        for (const child of node.children) {
          const childStats = computeForNode(child);
          count += childStats.count;
          totalScore += childStats.totalScore;
          scoredCount += childStats.scoredCount;
        }
      }

      stats.set(node.id || node.name, {
        count,
        avgScore: scoredCount > 0 ? totalScore / scoredCount : 0,
        sourceCount: node.sourceChunkRefs?.length ?? 0,
      });

      return { count, totalScore, scoredCount };
    };

    for (const node of hierarchy) {
      computeForNode(node);
    }
    return stats;
  }, [hierarchy, recordsByTopic]);

  // Filter records
  const filteredRecordsByTopic = useMemo(() => {
    const result = new Map<string, DatasetRecord[]>();
    const queryLower = searchQuery.toLowerCase();

    for (const [topic, topicRecords] of recordsByTopic) {
      let filtered = topicRecords;

      // Topic filter
      if (topicFilter !== "all" && topic !== topicFilter) continue;

      // Search filter
      if (queryLower) {
        filtered = filtered.filter((r) => {
          const { userText, assistantText } = extractRecordText(r);
          return userText.toLowerCase().includes(queryLower) ||
                 assistantText.toLowerCase().includes(queryLower);
        });
      }

      // Score filter
      if (scoreFilter !== "all") {
        filtered = filtered.filter((r) => {
          const s = getRecordScore(r);
          if (scoreFilter === "high") return s !== undefined && s >= 0.8;
          if (scoreFilter === "mid") return s !== undefined && s >= 0.6 && s < 0.8;
          if (scoreFilter === "low") return s !== undefined && s < 0.6;
          return true;
        });
      }

      if (filtered.length > 0) {
        result.set(topic, filtered);
      }
    }
    return result;
  }, [recordsByTopic, searchQuery, topicFilter, scoreFilter]);

  // Build flat display list from hierarchy
  const displayRows = useMemo(() => {
    const rows: DisplayRow[] = [];
    const isFiltering = searchQuery || topicFilter !== "all" || scoreFilter !== "all";
    const activeRecords = isFiltering ? filteredRecordsByTopic : recordsByTopic;

    const walkNode = (node: TopicHierarchyNode, depth: number) => {
      const nodeId = node.id || node.name;
      const hasChildren = (node.children?.length ?? 0) > 0;
      const nodeStats = topicStats.get(nodeId);
      const directRecords = activeRecords.get(node.name) ?? activeRecords.get(node.id) ?? [];
      const isCollapsed = collapsedIds.has(nodeId);

      if (hasChildren) {
        // Parent group header
        rows.push({
          type: "parent",
          node,
          depth,
          recordCount: nodeStats?.count ?? 0,
          avgScore: nodeStats?.avgScore ?? 0,
          coveragePct: records.length > 0 ? ((nodeStats?.count ?? 0) / records.length) * 100 : 0,
        });

        if (!isCollapsed) {
          // Direct records under this parent
          for (const record of directRecords) {
            rows.push({ type: "record", record, depth: depth + 1, parentTopic: node.name });
          }
          // Child nodes
          for (const child of node.children!) {
            walkNode(child, depth + 1);
          }
        }
      } else {
        // Leaf = subgroup header
        rows.push({
          type: "subgroup",
          node,
          depth,
          recordCount: directRecords.length,
          avgScore: nodeStats?.avgScore ?? 0,
          sourceCount: nodeStats?.sourceCount ?? 0,
        });

        if (!isCollapsed) {
          for (const record of directRecords) {
            rows.push({ type: "record", record, depth: depth + 1, parentTopic: node.name });
          }
        }
      }
    };

    for (const node of hierarchy) {
      walkNode(node, 0);
    }

    // Unassigned records
    const unassigned = activeRecords.get("__unassigned__");
    if (unassigned && unassigned.length > 0) {
      rows.push({
        type: "subgroup",
        node: { id: "__unassigned__", name: "Unassigned" } as TopicHierarchyNode,
        depth: 0,
        recordCount: unassigned.length,
        avgScore: 0,
        sourceCount: 0,
      });
      if (!collapsedIds.has("__unassigned__")) {
        for (const record of unassigned) {
          rows.push({ type: "record", record, depth: 1, parentTopic: "__unassigned__" });
        }
      }
    }

    return rows;
  }, [hierarchy, collapsedIds, topicStats, records.length, searchQuery, topicFilter, scoreFilter, filteredRecordsByTopic, recordsByTopic]);

  const toggleCollapsed = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Listen for focus topic events (from canvas "View in Table")
  useEffect(() => {
    const handleFocusTopic = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.topicId) return;
      // Expand ancestors
      const expandAncestors = (nodes: TopicHierarchyNode[], target: string, path: string[]): string[] | null => {
        for (const node of nodes) {
          const nodeId = node.id || node.name;
          if (nodeId === target || node.name === target) return path;
          if (node.children) {
            const result = expandAncestors(node.children, target, [...path, nodeId]);
            if (result) return result;
          }
        }
        return null;
      };
      const ancestors = expandAncestors(hierarchy, detail.topicId, []);
      if (ancestors) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          for (const id of ancestors) next.delete(id);
          next.delete(detail.topicId);
          return next;
        });
      }
    };

    window.addEventListener("vllora_focus_topic", handleFocusTopic);
    return () => window.removeEventListener("vllora_focus_topic", handleFocusTopic);
  }, [hierarchy]);

  // Listen for highlight record events
  useEffect(() => {
    const handleHighlight = ({ recordId }: { recordId: string }) => {
      setHighlightedRecordId(recordId);
      setTimeout(() => setHighlightedRecordId(null), 2000);
    };
    emitter.on("vllora_highlight_record", handleHighlight);
    return () => { emitter.off("vllora_highlight_record", handleHighlight); };
  }, []);

  // Handle prompt panel toggle
  const handlePromptToggle = useCallback((topicId: string) => {
    window.dispatchEvent(new CustomEvent("vllora_toggle_prompt_panel", {
      detail: { topicId },
    }));
  }, []);

  return (
    <table ref={tableRef} className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border/50 text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          <th className="text-left px-3 py-2 w-8">#</th>
          <th className="text-left px-3 py-2" style={{ width: "30%" }}>Input</th>
          <th className="text-left px-3 py-2" style={{ width: "40%" }}>Output</th>
          <th className="text-left px-3 py-2 w-20">Score</th>
          <th className="text-left px-3 py-2 w-28">Source</th>
        </tr>
      </thead>
      <tbody>
        {displayRows.map((row, i) => {
          if (row.type === "parent") {
            return (
              <ParentHeaderRow
                key={`p-${row.node.id}-${i}`}
                node={row.node}
                depth={row.depth}
                recordCount={row.recordCount}
                avgScore={row.avgScore}
                coveragePct={row.coveragePct}
                isCollapsed={collapsedIds.has(row.node.id || row.node.name)}
                onToggle={() => toggleCollapsed(row.node.id || row.node.name)}
              />
            );
          }
          if (row.type === "subgroup") {
            return (
              <SubgroupHeaderRow
                key={`s-${row.node.id}-${i}`}
                node={row.node}
                depth={row.depth}
                recordCount={row.recordCount}
                avgScore={row.avgScore}
                sourceCount={row.sourceCount}
                isCollapsed={collapsedIds.has(row.node.id || row.node.name)}
                onToggle={() => toggleCollapsed(row.node.id || row.node.name)}
                onPromptToggle={() => handlePromptToggle(row.node.id || row.node.name)}
              />
            );
          }
          return (
            <RecordTableRow
              key={`r-${row.record.id}`}
              record={row.record}
              depth={row.depth}
              index={i}
              isHighlighted={highlightedRecordId === row.record.id}
              onExpand={onExpand}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Row Components ───

function ParentHeaderRow({
  node,
  depth,
  recordCount,
  avgScore,
  coveragePct,
  isCollapsed,
  onToggle,
}: {
  readonly node: TopicHierarchyNode;
  readonly depth: number;
  readonly recordCount: number;
  readonly avgScore: number;
  readonly coveragePct: number;
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  const paddingLeft = 12 + depth * 20;

  return (
    <tr
      className="border-b border-border/30 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <td colSpan={5} className="py-2.5" style={{ paddingLeft }}>
        <div className="flex items-center gap-2">
          <Chevron className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground">{node.name}</span>
          <div className="flex items-center gap-3 ml-auto pr-3 text-[10px] text-muted-foreground/60">
            <span className="tabular-nums">{recordCount} records</span>
            {avgScore > 0 && (
              <span className="tabular-nums">avg {avgScore.toFixed(2)}</span>
            )}
            {coveragePct > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      coveragePct >= 80 ? "bg-emerald-500" : coveragePct >= 60 ? "bg-amber-500" : "bg-red-500",
                    )}
                    style={{ width: `${Math.min(coveragePct, 100)}%` }}
                  />
                </div>
                <span className="tabular-nums">{coveragePct.toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function SubgroupHeaderRow({
  node,
  depth,
  recordCount,
  avgScore,
  sourceCount,
  isCollapsed,
  onToggle,
  onPromptToggle,
}: {
  readonly node: TopicHierarchyNode;
  readonly depth: number;
  readonly recordCount: number;
  readonly avgScore: number;
  readonly sourceCount: number;
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
  readonly onPromptToggle: () => void;
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  const paddingLeft = 12 + depth * 20;

  return (
    <tr
      className="border-b border-border/20 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <td colSpan={5} className="py-2" style={{ paddingLeft }}>
        <div className="flex items-center gap-2">
          {/* Tree line indicator */}
          <span className="w-3 border-l border-b border-border/40 h-3 shrink-0" />
          <Chevron className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          <span className="text-xs font-medium text-foreground">{node.name}</span>
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{recordCount}</span>
          <div className="flex items-center gap-2.5 ml-auto pr-3 text-[10px] text-muted-foreground/50">
            {avgScore > 0 && (
              <span className="flex items-center gap-1">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  avgScore >= 0.8 ? "bg-emerald-500" : avgScore >= 0.6 ? "bg-amber-500" : "bg-red-500",
                )} />
                <span className="tabular-nums">{avgScore.toFixed(2)}</span>
              </span>
            )}
            {sourceCount > 0 && (
              <span className="tabular-nums">{sourceCount} source{sourceCount !== 1 ? "s" : ""}</span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPromptToggle(); }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground/40 hover:text-foreground transition-colors"
              title="View prompt chain"
            >
              <MessageSquare className="w-3 h-3" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function RecordTableRow({
  record,
  depth,
  index,
  isHighlighted,
  onExpand,
}: {
  readonly record: DatasetRecord;
  readonly depth: number;
  readonly index: number;
  readonly isHighlighted: boolean;
  readonly onExpand?: (record: DatasetRecord) => void;
}) {
  const { userText, assistantText } = useMemo(() => extractRecordText(record), [record]);
  const score = getRecordScore(record);
  const sourceRef = getSourceRef(record);
  const paddingLeft = 12 + depth * 20;

  return (
    <tr
      className={cn(
        "border-b border-border/10 hover:bg-muted/30 cursor-pointer transition-colors text-xs",
        isHighlighted && "animate-record-highlight",
      )}
      onClick={() => onExpand?.(record)}
    >
      <td className="px-3 py-2 text-muted-foreground/40 tabular-nums" style={{ paddingLeft }}>
        {index + 1}
      </td>
      <td className="px-3 py-2">
        <p className="text-foreground/80 line-clamp-2 leading-relaxed">{userText || "—"}</p>
      </td>
      <td className="px-3 py-2">
        <p className="text-foreground/60 line-clamp-2 leading-relaxed">{assistantText || "—"}</p>
      </td>
      <td className="px-3 py-2">
        {score !== undefined ? (
          <ScorePill score={score} />
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {sourceRef ? (
          <span className="text-[10px] text-muted-foreground/50 truncate block max-w-[120px]" title={sourceRef}>
            {sourceRef}
          </span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </td>
    </tr>
  );
}

function ScorePill({ score }: { readonly score: number }) {
  const bg = score >= 0.8
    ? "bg-emerald-500/15 text-emerald-400"
    : score >= 0.6
      ? "bg-amber-500/15 text-amber-400"
      : "bg-red-500/15 text-red-400";

  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium tabular-nums", bg)}>
      {score.toFixed(2)}
    </span>
  );
}
