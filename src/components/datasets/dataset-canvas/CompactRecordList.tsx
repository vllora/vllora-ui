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
import { Trash2, ChevronRight, Coins, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { extractMessages, cleanText } from "../records-table/cells/ConversationThreadCell.utilities";
import { estimateTokens } from "../records-table/cells/StatsBadge";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";

// Row heights for virtualizer
const RECORD_ROW_HEIGHT = 80;
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
  /** Called when a record is clicked for detail view */
  onSelectRecord?: (record: DatasetRecord) => void;
}

// ─── Flat mode components ────────────────────────────────────────────────────

function CompactRecordRow({ record, onDelete, onSelectRecord }: { record: DatasetRecord; onDelete?: (id: string) => void; onSelectRecord?: (record: DatasetRecord) => void }) {
  const messages = extractMessages(record.data);
  const tokens = estimateTokens(record.data);

  // Find first user message and first assistant message
  const userMsg = messages.find((m) => m.role === "user");
  const assistantMsg = messages.find((m) => m.role === "assistant");
  const userText = userMsg ? cleanText(userMsg.content) : "";
  const assistantText = assistantMsg ? cleanText(assistantMsg.content) : "";

  const score = record.evaluation?.score ?? record.evaluation?.evalScore;
  const scoreDotColor = score != null
    ? score >= 0.8 ? "bg-emerald-400" : score >= 0.6 ? "bg-amber-400" : "bg-red-400"
    : null;

  return (
    <div
      className={cn(
        "group/row relative py-2 px-3 transition-all border-b border-border/20",
        "hover:bg-muted/30",
        onSelectRecord && "cursor-pointer"
      )}
      onClick={() => onSelectRecord?.(record)}
    >
      {/* Hover accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[rgba(var(--theme-500),0.3)] opacity-0 group-hover/row:opacity-100 transition-opacity" />

      {/* Content-first: user message with 2-line clamp */}
      <p className="text-xs text-foreground leading-relaxed line-clamp-2 mb-1">
        {userText || <span className="text-muted-foreground/50 italic">No user message</span>}
      </p>

      {/* Dimmed assistant preview */}
      {assistantText && (
        <p className="text-[11px] text-muted-foreground/50 truncate mb-1.5">
          → {assistantText}
        </p>
      )}

      {/* Stats footer: tokens + score + delete */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground/50">
          {record.is_generated && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]">
              <Sparkles className="w-2 h-2" />
              AI
            </span>
          )}
          <span className="flex items-center gap-1">
            <Coins className="w-2.5 h-2.5" />
            {tokens.toLocaleString()}
          </span>
          {score != null && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help">
                    <div className={cn("w-1.5 h-1.5 rounded-full", scoreDotColor)} />
                    <span className="text-[10px] tabular-nums">{score.toFixed(2)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Evaluation score</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Delete — hover only */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(record.id);
            }}
            className="p-1 rounded text-muted-foreground/0 group-hover/row:text-muted-foreground hover:!text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete record"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
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
  hasChildren,
}: {
  name: string;
  hasContent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  totalCount: number;
  hasChildren: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 py-2 px-3 text-left transition-colors",
        "bg-muted/60 hover:bg-muted/80 border-l-2 border-l-[rgba(var(--theme-500),0.4)]"
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
              "w-3.5 h-3.5 transition-transform duration-200 text-[rgba(var(--theme-500),0.7)]",
              isExpanded && "rotate-90"
            )}
          />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-border" />
        )}
      </button>

      {/* Topic name */}
      <span className="text-xs font-medium text-[rgb(var(--theme-500))] truncate flex-1 min-w-0">
        {name}
      </span>

      {/* Count badge — hide when expanded with children */}
      {(!isExpanded || !hasChildren) && totalCount > 0 && (
        <span className="text-xs tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
          {totalCount}
        </span>
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
  onSelectRecord,
}: {
  records: DatasetRecord[];
  onDelete?: (id: string) => void;
  onSelectRecord?: (record: DatasetRecord) => void;
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
              <CompactRecordRow record={record} onDelete={onDelete} onSelectRecord={onSelectRecord} />
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
  onSelectRecord,
}: {
  hierarchyNode: TopicHierarchyNode;
  recordsByTopic: Record<string, DatasetRecord[]>;
  totalRecords: number;
  onDelete?: (id: string) => void;
  onSelectRecord?: (record: DatasetRecord) => void;
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
              <CompactRecordRow record={item.record} onDelete={onDelete} onSelectRecord={onSelectRecord} />
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
  onSelectRecord,
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
        onSelectRecord={onSelectRecord}
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
    <VirtualizedFlatList records={records} onDelete={onDelete} onSelectRecord={onSelectRecord} />
  );
}
