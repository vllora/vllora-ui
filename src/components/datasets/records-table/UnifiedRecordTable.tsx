/**
 * UnifiedRecordTable
 *
 * Single `<table>` layout with 3 row types:
 * - Parent group header row (collapsible, aggregated stats)
 * - Subgroup header row (topic name, score, source count)
 * - Record row (input, per-job score pills, source parts cell)
 *
 * Score columns are dynamic — one per eval/finetune job.
 * Source column uses shared SourcePartsCell (same as TopicDetailView).
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import type { KnowledgeSource } from "@/types/knowledge-types";
import { extractMessages, cleanText } from "./cells/ConversationThreadCell.utilities";
import { emitter } from "@/utils/eventEmitter";
import type { JobColumn, RecordJobScore } from "./job-score-columns";
import {
  FallbackScorePill,
  ScoreCell,
  JobColumnHeader,
  SourcePartsCell,
  useResolvedSourceParts,
} from "./shared-record-cells";

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
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  readonly sources?: readonly KnowledgeSource[];
}

// ─── Helpers ───

function getRecordScore(record: DatasetRecord): number | undefined {
  return record.evaluation?.score ?? record.evaluation?.evalScore;
}

function extractRecordText(record: DatasetRecord): { userText: string } {
  const msgs = extractMessages(record.data).filter(
    (m) => m.role.toLowerCase() !== "system",
  );
  const userMsg = msgs.find((m) => {
    const r = m.role.toLowerCase();
    return r === "user" || r === "human";
  });

  return {
    userText: userMsg ? cleanText(userMsg.content) : (msgs[0] ? cleanText(msgs[0].content) : ""),
  };
}

// ─── Component ───

export function UnifiedRecordTable({
  hierarchy,
  records,
  searchQuery,
  topicFilter,
  scoreFilter,
  onExpand,
  jobColumns = [],
  getScoresForRecord,
  sources = [],
}: UnifiedRecordTableProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const hasJobColumns = jobColumns.length > 0;
  const hasEvalCols = jobColumns.some((c) => c.type === "eval");
  const hasFtCols = jobColumns.some((c) => c.type === "finetune");
  const hasSeparator = hasEvalCols && hasFtCols;
  // # + Input + (N job columns + optional separator or 1 fallback score) + Source
  const totalColumns = hasJobColumns ? 3 + jobColumns.length + (hasSeparator ? 1 : 0) : 4;

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

      if (topicFilter !== "all" && topic !== topicFilter) continue;

      if (queryLower) {
        filtered = filtered.filter((r) => {
          const { userText } = extractRecordText(r);
          return userText.toLowerCase().includes(queryLower);
        });
      }

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
        rows.push({
          type: "parent",
          node,
          depth,
          recordCount: nodeStats?.count ?? 0,
          avgScore: nodeStats?.avgScore ?? 0,
          coveragePct: records.length > 0 ? ((nodeStats?.count ?? 0) / records.length) * 100 : 0,
        });

        if (!isCollapsed) {
          for (const record of directRecords) {
            rows.push({ type: "record", record, depth: depth + 1, parentTopic: node.name });
          }
          for (const child of node.children!) {
            walkNode(child, depth + 1);
          }
        }
      } else {
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


  return (
    <table ref={tableRef} className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border/50 text-[10px] text-muted-foreground/60 tracking-wider">
          <th className="text-left px-3 py-2 w-8">#</th>
          <th className="text-left px-3 py-2">Input</th>
          {hasJobColumns ? (
            jobColumns.map((col, i) => {
              const needsSep = hasSeparator && i > 0 && col.type === "finetune" && jobColumns[i - 1].type === "eval";
              return (
                <th key={col.id} className={cn("text-center px-2 py-2 w-[100px]", needsSep && "border-l-2 border-border pl-3")}>
                  <JobColumnHeader column={col} />
                </th>
              );
            })
          ) : (
            <th className="text-left px-3 py-2 w-20">Score</th>
          )}
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
                colSpan={totalColumns}
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
                colSpan={totalColumns}
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
              jobColumns={jobColumns}
              getScoresForRecord={getScoresForRecord}
              sources={sources}
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
  colSpan,
}: {
  readonly node: TopicHierarchyNode;
  readonly depth: number;
  readonly recordCount: number;
  readonly avgScore: number;
  readonly coveragePct: number;
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
  readonly colSpan: number;
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  const paddingLeft = 12 + depth * 20;

  return (
    <tr
      className="border-b border-border/30 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <td colSpan={colSpan} className="py-2.5" style={{ paddingLeft }}>
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
  colSpan,
}: {
  readonly node: TopicHierarchyNode;
  readonly depth: number;
  readonly recordCount: number;
  readonly avgScore: number;
  readonly sourceCount: number;
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
  readonly colSpan: number;
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  const paddingLeft = 12 + depth * 20;

  return (
    <tr
      className="border-b border-border/20 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={onToggle}
      data-topic-group={node.id || node.name}
    >
      <td colSpan={colSpan} className="py-2" style={{ paddingLeft }}>
        <div className="flex items-center gap-2">
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
  jobColumns = [],
  getScoresForRecord,
  sources = [],
}: {
  readonly record: DatasetRecord;
  readonly depth: number;
  readonly index: number;
  readonly isHighlighted: boolean;
  readonly onExpand?: (record: DatasetRecord) => void;
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  readonly sources?: readonly KnowledgeSource[];
}) {
  const { userText } = useMemo(() => extractRecordText(record), [record]);
  const paddingLeft = 12 + depth * 20;
  const hasJobColumns = jobColumns.length > 0;

  const scores = useMemo(
    () => getScoresForRecord?.(record.id),
    [getScoresForRecord, record.id],
  );

  const { partRefs, resolvedParts } = useResolvedSourceParts(record, sources);

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
      {hasJobColumns ? (
        jobColumns.map((col, i) => {
          const jobScore = scores?.get(col.id);
          const needsSep = i > 0 && col.type === "finetune" && jobColumns[i - 1].type === "eval";
          return (
            <td key={col.id} className={cn("px-1 py-2 text-center", needsSep && "border-l-2 border-border pl-3")}>
              <ScoreCell jobScore={jobScore} />
            </td>
          );
        })
      ) : (
        <td className="px-3 py-2">
          <FallbackScorePill score={getRecordScore(record)} />
        </td>
      )}
      <td className="px-3 py-2">
        <SourcePartsCell resolvedParts={resolvedParts} unresolvedCount={partRefs.length} />
      </td>
    </tr>
  );
}
