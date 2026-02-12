/**
 * RecordsPanel
 *
 * Slide-in side panel for viewing topic records while maintaining canvas context.
 * Renders as a flex sibling to the canvas, so the canvas shrinks naturally.
 * Uses CompactRecordList (NOT RecordsTable) to avoid coupling with the table tab view.
 *
 * For parent topics, passes hierarchy node so CompactRecordList renders the same
 * TopicNodeHeader tree as the table view tab.
 * For leaf topics, passes a flat record list.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { X, Search, ChevronLeft, ChevronRight, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BreadcrumbPath } from "../records-table/BreadcrumbPath";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { CompactRecordList } from "./CompactRecordList";
import { filterRecords, type RecordFilterOptions } from "../record-filters";
import { findTopicInHierarchy } from "../record-utils";
import type { DatasetRecord } from "@/types/dataset-types";

export function RecordsPanel() {
  const {
    viewingTopicId,
    closeTopicModal,
    getSiblingTopics,
    openTopicModal,
    setSelectedTopic,
    recordsByTopic,
    hierarchy,
    totalRecordCount,
    onDeleteRecord,
    onSelectRecordId,
    onViewInTable,
  } = TopicCanvasConsumer();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Reset search when topic changes
  useEffect(() => {
    setSearchQuery("");
  }, [viewingTopicId]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeTopicModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTopicModal]);

  // Resolve topic info
  const { topicNode, topicRecords, topicDisplayName, isParentTopic } = useMemo(() => {
    if (!viewingTopicId) {
      return { topicNode: undefined, topicRecords: [], topicDisplayName: "", isParentTopic: false };
    }

    if (viewingTopicId === "__unassigned__") {
      return {
        topicNode: undefined,
        topicRecords: recordsByTopic[viewingTopicId] || [],
        topicDisplayName: "Unassigned",
        isParentTopic: false,
      };
    }

    const node = findTopicInHierarchy(hierarchy, viewingTopicId);
    const displayName = node?.name || viewingTopicId;
    const hasChildren = node?.children && node.children.length > 0;

    if (hasChildren) {
      // Parent topic — collect all records under this subtree for count/search
      const allRecords = collectAllRecordsUnder(node!, recordsByTopic);
      return {
        topicNode: node,
        topicRecords: allRecords,
        topicDisplayName: displayName,
        isParentTopic: true,
      };
    }

    // Leaf node — flat records
    const byKey = recordsByTopic[viewingTopicId] || [];
    if (byKey.length > 0) {
      return { topicNode: node, topicRecords: byKey, topicDisplayName: displayName, isParentTopic: false };
    }
    if (node && node.name !== viewingTopicId) {
      return { topicNode: node, topicRecords: recordsByTopic[node.name] || [], topicDisplayName: displayName, isParentTopic: false };
    }
    if (node && node.id !== viewingTopicId) {
      return { topicNode: node, topicRecords: recordsByTopic[node.id] || [], topicDisplayName: displayName, isParentTopic: false };
    }

    return { topicNode: node, topicRecords: [], topicDisplayName: displayName, isParentTopic: false };
  }, [viewingTopicId, recordsByTopic, hierarchy]);

  // Filter records by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return topicRecords;
    const options: RecordFilterOptions = { search: searchQuery };
    return filterRecords(topicRecords, options);
  }, [topicRecords, searchQuery]);

  // For tree mode with search, build a filtered recordsByTopic so the tree only shows matching records
  const filteredRecordsByTopic = useMemo(() => {
    if (!isParentTopic || !searchQuery.trim()) return recordsByTopic;
    const filteredIds = new Set(filteredRecords.map(r => r.id));
    const filtered: Record<string, typeof topicRecords> = {};
    for (const [key, records] of Object.entries(recordsByTopic)) {
      const matching = records.filter(r => filteredIds.has(r.id));
      if (matching.length > 0) {
        filtered[key] = matching;
      }
    }
    return filtered;
  }, [isParentTopic, searchQuery, filteredRecords, recordsByTopic]);

  // Sibling navigation
  const siblings = useMemo(() => {
    if (!viewingTopicId) return { prev: null, next: null };
    return getSiblingTopics(viewingTopicId);
  }, [viewingTopicId, getSiblingTopics]);

  // Resolve sibling topic names and record counts for tooltip previews
  const siblingInfo = useMemo(() => {
    const resolve = (id: string | null) => {
      if (!id) return null;
      if (id === "__unassigned__") {
        const count = (recordsByTopic["__unassigned__"] || []).length;
        return { name: "Unassigned", count };
      }
      const node = findTopicInHierarchy(hierarchy, id);
      const name = node?.name || id;
      const records = recordsByTopic[id] || recordsByTopic[name] || [];
      return { name, count: records.length };
    };
    return { prev: resolve(siblings.prev), next: resolve(siblings.next) };
  }, [siblings, hierarchy, recordsByTopic]);

  // Build breadcrumb path for current topic
  const breadcrumbPath = useMemo(() => {
    if (!viewingTopicId || viewingTopicId === "__unassigned__") return null;
    // Walk the hierarchy to find the path to the current topic
    const findPath = (nodes: typeof hierarchy, trail: string[]): string[] | null => {
      if (!nodes) return null;
      for (const node of nodes) {
        const nodeId = node.id || node.name;
        if (nodeId === viewingTopicId || node.name === viewingTopicId) {
          return [...trail, node.name];
        }
        if (node.children && node.children.length > 0) {
          const result = findPath(node.children, [...trail, node.name]);
          if (result) return result;
        }
      }
      return null;
    };
    const path = findPath(hierarchy, []);
    // Only show breadcrumb if path has more than 1 segment (i.e., topic is nested)
    return path && path.length > 1 ? path : null;
  }, [viewingTopicId, hierarchy]);

  // Navigate to a sibling topic — updates both panel content and canvas selection
  const navigateToSibling = useCallback((topicId: string) => {
    openTopicModal(topicId);
    // Resolve the topic name for canvas selection
    const node = findTopicInHierarchy(hierarchy, topicId);
    setSelectedTopic(node?.name || topicId);
  }, [openTopicModal, hierarchy, setSelectedTopic]);

  const recordCountText = `${filteredRecords.length}${filteredRecords.length !== topicRecords.length ? ` of ${topicRecords.length}` : ""} record${topicRecords.length !== 1 ? "s" : ""}`;

  return (
    <div className="w-[clamp(320px,35%,500px)] border-l border-border flex flex-col h-full bg-background animate-in slide-in-from-right-5 duration-200">
      {/* Header + Search (Stitch dense-list style) */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        {/* Breadcrumb path */}
        {breadcrumbPath && (
          <BreadcrumbPath path={breadcrumbPath} className="mb-2" />
        )}

        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="text-sm font-semibold truncate">{topicDisplayName}</h3>
            <span className="inline-flex items-center rounded-full bg-[rgba(var(--theme-500),0.1)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--theme-500))] shrink-0">
              {recordCountText}
              {isParentTopic && " across child topics"}
            </span>
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1 shrink-0">
              {onViewInTable && viewingTopicId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onViewInTable(viewingTopicId)}
                      className="p-1.5 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <TableProperties className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">View in table</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={closeTopicModal}
                    className="p-1.5 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Close panel (Esc)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {/* Search — integrated in header */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search within records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 pr-8 text-sm rounded-lg"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Compact record list — independent from RecordsTable */}
      <div className="flex-1 overflow-hidden min-h-0">
        <CompactRecordList
          records={isParentTopic ? undefined : filteredRecords}
          hierarchyNode={isParentTopic ? topicNode : undefined}
          recordsByTopic={isParentTopic ? filteredRecordsByTopic : undefined}
          totalRecords={totalRecordCount}
          onDelete={onDeleteRecord}
          onSelectRecord={onSelectRecordId ? (record) => onSelectRecordId(record.id) : undefined}
        />
      </div>

      {/* Footer: sibling nav with tooltip previews */}
      <div className="flex items-center justify-center px-3 py-2 border-t border-border flex-shrink-0">
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  disabled={!siblings.prev}
                  onClick={() => siblings.prev && navigateToSibling(siblings.prev)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
              </TooltipTrigger>
              {siblingInfo.prev && (
                <TooltipContent side="top">
                  <p className="text-xs">
                    {siblingInfo.prev.name} ({siblingInfo.prev.count} record{siblingInfo.prev.count !== 1 ? "s" : ""})
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  disabled={!siblings.next}
                  onClick={() => siblings.next && navigateToSibling(siblings.next)}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              {siblingInfo.next && (
                <TooltipContent side="top">
                  <p className="text-xs">
                    {siblingInfo.next.name} ({siblingInfo.next.count} record{siblingInfo.next.count !== 1 ? "s" : ""})
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}

/** Recursively collect all records under a node */
function collectAllRecordsUnder(
  node: { id: string; name: string; children?: { id: string; name: string; children?: unknown[] }[] },
  recordsByTopic: Record<string, DatasetRecord[]>,
): DatasetRecord[] {
  if (!node.children || node.children.length === 0) {
    const byId = recordsByTopic[node.id || node.name] || [];
    if (byId.length > 0) return byId;
    if (node.id && node.id !== node.name) {
      return recordsByTopic[node.name] || [];
    }
    return [];
  }
  const records: DatasetRecord[] = [];
  for (const child of node.children) {
    records.push(...collectAllRecordsUnder(child as typeof node, recordsByTopic));
  }
  return records;
}
