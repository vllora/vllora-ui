/**
 * CompactRecordList
 *
 * Standalone compact record list designed for the 500px slide-in panel.
 * Shows conversation previews (SYS + USR lines) with delete action.
 * For parent topics, renders a compact tree with collapsible topic headers.
 * Uses @tanstack/react-virtual for virtualization (handles thousands of records).
 * Completely independent from RecordsTable — changes here don't affect table view.
 */

import { useCallback, useRef, useState, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Copy, Check, ChevronRight, Coins, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractMessages, getRoleLabel, getRoleStyle, cleanText } from "../records-table/cells/ConversationThreadCell.utilities";
import { estimateTokens, countTurns } from "../records-table/cells/StatsBadge";
import { countTools } from "../records-table/cells/ToolsBadge";
import { CoverageIndicator } from "./CoverageIndicator";
import type { DatasetRecord, DatasetEvaluation, TopicHierarchyNode } from "@/types/dataset-types";

// Row heights for virtualizer
const RECORD_ROW_HEIGHT = 68;
const HEADER_ROW_HEIGHT = 36;

interface CompactRecordListProps {
  /** Flat list of records (used for leaf topics) */
  records?: DatasetRecord[];
  /** Topic hierarchy node to render as tree (used for parent topics) */
  hierarchyNode?: TopicHierarchyNode;
  /** Records keyed by topic id/name (needed for tree mode) */
  recordsByTopic?: Record<string, DatasetRecord[]>;
  /** Total records across all topics (for coverage percentage) */
  totalRecords?: number;
  onDelete?: (recordId: string) => void;
}

// ─── Flat mode components ────────────────────────────────────────────────────

function CompactRecordId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const shortId = id.length > 6 ? id.slice(0, 6) : id;

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [id]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy: ${id}`}
      className="font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-0.5 shrink-0"
    >
      {shortId}
      {copied ? <Check className="h-2 w-2 text-emerald-400" /> : <Copy className="h-2 w-2 opacity-0 group-hover/row:opacity-100" />}
    </button>
  );
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-red-400";
}

function CompactRecordStats({ data, evaluation }: { data: unknown; evaluation?: DatasetEvaluation }) {
  const tokens = estimateTokens(data);
  const turns = countTurns(data);
  const tools = countTools(data);

  // Resolve dryrun/finetune scores
  const dryRunScore = evaluation?.dryRunScore ?? (
    evaluation?.score != null && !evaluation?.finetuneScore ? evaluation.score : undefined
  );
  const dryRunAvg = evaluation?.dryRunAvg;
  const dryRunCount = evaluation?.dryRunCount ?? (dryRunScore != null ? 1 : 0);
  const finetuneScore = evaluation?.finetuneScore;
  const finetuneAvg = evaluation?.finetuneAvg;
  const finetuneCount = evaluation?.finetuneCount ?? 0;

  const drDisplay = dryRunCount > 1 && dryRunAvg != null ? dryRunAvg : dryRunScore;
  const ftDisplay = finetuneCount > 1 && finetuneAvg != null ? finetuneAvg : finetuneScore;

  return (
    <div className="flex items-center gap-3 mt-0.5">
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <Coins className="w-2.5 h-2.5 text-emerald-500/70" />
        {tokens.toLocaleString()}
      </span>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <MessageSquare className="w-2.5 h-2.5" />
        {turns}
      </span>
      {tools > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded bg-zinc-500/10 border border-zinc-500/20 text-zinc-400">
          <span className="text-zinc-500 italic font-serif">fx</span>
          {tools}
        </span>
      )}
      {drDisplay != null && (
        <span className="flex items-baseline gap-1 text-[10px]">
          <span className="text-zinc-500">{dryRunCount > 1 ? "Avg Dryrun" : "Dryrun"}:</span>
          <span className={cn("font-semibold tabular-nums", getScoreColor(drDisplay))}>{drDisplay.toFixed(2)}</span>
        </span>
      )}
      {ftDisplay != null && (
        <span className="flex items-baseline gap-1 text-[10px]">
          <span className="text-zinc-500">{finetuneCount > 1 ? "Avg FT" : "FT"}:</span>
          <span className={cn("font-semibold tabular-nums", getScoreColor(ftDisplay))}>{ftDisplay.toFixed(2)}</span>
        </span>
      )}
    </div>
  );
}

function CompactRecordRow({ record, onDelete }: { record: DatasetRecord; onDelete?: (id: string) => void }) {
  const messages = extractMessages(record.data);
  const previewMessages = messages.slice(0, 2);

  return (
    <div
      className={cn(
        "group/row flex items-start gap-2 px-2 py-2 rounded-md transition-colors",
        "hover:bg-muted/50"
      )}
    >
      {/* ID */}
      <div className="mt-0.5 shrink-0">
        <CompactRecordId id={record.id} />
      </div>

      {/* Message previews + stats */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {previewMessages.map((msg, i) => {
          const roleLabel = getRoleLabel(msg.role);
          const { badgeClass } = getRoleStyle(msg.role);
          const text = cleanText(msg.content);
          const truncated = text.length > 80 ? text.slice(0, 80) + "..." : text;

          return (
            <div key={i} className="flex items-baseline gap-1.5 min-w-0">
              <span className={cn(
                "text-[9px] font-semibold px-1 py-px rounded shrink-0",
                badgeClass
              )}>
                {roleLabel}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {truncated || "(empty)"}
              </span>
            </div>
          );
        })}
        {previewMessages.length === 0 && (
          <span className="text-xs text-muted-foreground/50 italic">No messages</span>
        )}
        {/* Stats: tokens, turns, scores */}
        <CompactRecordStats data={record.data} evaluation={record.evaluation} />
      </div>

      {/* Delete — hover only */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(record.id);
          }}
          className="mt-0.5 shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground/0 group-hover/row:text-muted-foreground hover:!text-destructive transition-colors"
          title="Delete record"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── Compact tree header (fits 500px panel) ──────────────────────────────────

/**
 * Compact topic header for the panel tree. Shows only the topic name (not full breadcrumb)
 * since the parent context is already visible in the panel header and canvas.
 * Matches the visual style of TopicNodeHeader but without breadcrumb overflow.
 */
function CompactTopicHeader({
  name,
  hasContent,
  isExpanded,
  onToggle,
  totalCount,
  percentage,
  hasChildren,
}: {
  name: string;
  hasContent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  totalCount: number;
  percentage: number;
  hasChildren: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 py-2 px-3 text-left transition-colors",
        "bg-zinc-900/60 hover:bg-zinc-800/60 border-l-2 border-l-emerald-500/40"
      )}
    >
      {/* Expand/collapse */}
      <button
        className={cn(
          "w-5 h-5 flex items-center justify-center shrink-0",
          hasContent ? "cursor-pointer" : "cursor-default opacity-50"
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (hasContent) onToggle();
        }}
        disabled={!hasContent}
      >
        {hasContent ? (
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 transition-transform duration-200 text-emerald-500/70",
              isExpanded && "rotate-90"
            )}
          />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
        )}
      </button>

      {/* Topic name */}
      <span className="text-xs font-medium text-emerald-400 truncate flex-1 min-w-0">
        {name}
      </span>

      {/* Count + coverage — hide when expanded with children */}
      {(!isExpanded || !hasChildren) && totalCount > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs tabular-nums px-1.5 py-0.5 rounded bg-zinc-700/50 text-muted-foreground">
            {totalCount}
          </span>
          <CoverageIndicator
            coveragePercentage={percentage}
            recordCount={totalCount}
          />
        </div>
      )}
    </div>
  );
}

// ─── Tree mode helpers ───────────────────────────────────────────────────────

/** Get records directly assigned to a node (by id or name) */
function getDirectRecords(
  node: TopicHierarchyNode,
  recordsByTopic: Record<string, DatasetRecord[]>,
): DatasetRecord[] {
  const byId = recordsByTopic[node.id || node.name] || [];
  if (byId.length > 0) return byId;
  if (node.id && node.id !== node.name) {
    return recordsByTopic[node.name] || [];
  }
  return [];
}

/** Calculate total record count for a node and all its descendants */
function calculateDescendantCount(
  node: TopicHierarchyNode,
  recordsByTopic: Record<string, DatasetRecord[]>,
): number {
  const directCount = getDirectRecords(node, recordsByTopic).length;
  const childCount = (node.children || []).reduce(
    (sum, child) => sum + calculateDescendantCount(child, recordsByTopic),
    0
  );
  return directCount + childCount;
}

/** Virtual item types for the flattened tree */
type TreeVirtualItem =
  | { type: "header"; node: TopicHierarchyNode; totalCount: number; percentage: number; hasChildren: boolean; hasContent: boolean; isExpanded: boolean; nodeKey: string }
  | { type: "record"; record: DatasetRecord; nodeKey: string };

/**
 * Flatten the tree into a list of virtual items respecting collapse state.
 */
function flattenTree(
  nodes: TopicHierarchyNode[],
  parentKey: string,
  recordsByTopic: Record<string, DatasetRecord[]>,
  totalRecords: number,
  collapsedNodes: Set<string>,
): TreeVirtualItem[] {
  const items: TreeVirtualItem[] = [];

  for (const node of nodes) {
    const nodeKey = parentKey ? `${parentKey}/${node.name}` : node.name;
    const hasChildren = !!(node.children && node.children.length > 0);
    const directRecords = getDirectRecords(node, recordsByTopic);
    const hasRecords = directRecords.length > 0;
    const hasContent = hasChildren || hasRecords;
    const totalCount = calculateDescendantCount(node, recordsByTopic);
    const percentage = totalRecords > 0 ? (totalCount / totalRecords) * 100 : 0;
    const isExpanded = !collapsedNodes.has(nodeKey);

    items.push({
      type: "header",
      node,
      totalCount,
      percentage,
      hasChildren,
      hasContent,
      isExpanded,
      nodeKey,
    });

    if (isExpanded && hasContent) {
      if (hasChildren) {
        items.push(...flattenTree(node.children!, nodeKey, recordsByTopic, totalRecords, collapsedNodes));
      }
      for (const record of directRecords) {
        items.push({ type: "record", record, nodeKey });
      }
    }
  }

  return items;
}

// ─── Virtualized flat list ───────────────────────────────────────────────────

function VirtualizedFlatList({
  records,
  onDelete,
}: {
  records: DatasetRecord[];
  onDelete?: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => RECORD_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        className="p-2 relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const record = records[virtualItem.index];
          return (
            <div
              key={record.id}
              className="absolute left-0 right-0 px-2"
              style={{
                top: virtualItem.start,
                height: virtualItem.size,
              }}
            >
              <CompactRecordRow record={record} onDelete={onDelete} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Virtualized tree list ───────────────────────────────────────────────────

function VirtualizedTreeList({
  hierarchyNode,
  recordsByTopic,
  totalRecords,
  onDelete,
}: {
  hierarchyNode: TopicHierarchyNode;
  recordsByTopic: Record<string, DatasetRecord[]>;
  totalRecords: number;
  onDelete?: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const toggleNode = useCallback((nodeKey: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  }, []);

  const flatItems = useMemo(
    () => flattenTree(
      hierarchyNode.children || [],
      hierarchyNode.name,
      recordsByTopic,
      totalRecords,
      collapsedNodes,
    ),
    [hierarchyNode, recordsByTopic, totalRecords, collapsedNodes],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => flatItems[index].type === "header" ? HEADER_ROW_HEIGHT : RECORD_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = flatItems[virtualItem.index];

          if (item.type === "header") {
            return (
              <div
                key={`h-${item.nodeKey}`}
                className="absolute left-0 right-0"
                style={{
                  top: virtualItem.start,
                  height: virtualItem.size,
                }}
              >
                <CompactTopicHeader
                  name={item.node.name}
                  hasContent={item.hasContent}
                  isExpanded={item.isExpanded}
                  onToggle={() => toggleNode(item.nodeKey)}
                  totalCount={item.totalCount}
                  percentage={item.percentage}
                  hasChildren={item.hasChildren}
                />
              </div>
            );
          }

          return (
            <div
              key={`r-${item.record.id}`}
              className="absolute left-0 right-0 px-2"
              style={{
                top: virtualItem.start,
                height: virtualItem.size,
              }}
            >
              <CompactRecordRow record={item.record} onDelete={onDelete} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function CompactRecordList({
  records,
  hierarchyNode,
  recordsByTopic,
  totalRecords = 0,
  onDelete,
}: CompactRecordListProps) {
  // Tree mode
  if (hierarchyNode && recordsByTopic) {
    const children = hierarchyNode.children || [];
    const hasAnyContent = children.length > 0 ||
      Object.values(recordsByTopic).some(r => r.length > 0);

    if (!hasAnyContent) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">No records</p>
        </div>
      );
    }

    return (
      <VirtualizedTreeList
        hierarchyNode={hierarchyNode}
        recordsByTopic={recordsByTopic}
        totalRecords={totalRecords}
        onDelete={onDelete}
      />
    );
  }

  // Flat mode
  if (!records || records.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No records</p>
      </div>
    );
  }

  return (
    <VirtualizedFlatList records={records} onDelete={onDelete} />
  );
}
