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

  // Navigate to a sibling topic — updates both panel content and canvas selection
  const navigateToSibling = useCallback((topicId: string) => {
    openTopicModal(topicId);
    // Resolve the topic name for canvas selection
    const node = findTopicInHierarchy(hierarchy, topicId);
    setSelectedTopic(node?.name || topicId);
  }, [openTopicModal, hierarchy, setSelectedTopic]);

  // Switch to table view mode, close panel, and focus the topic in the table tree
  const handleViewInTable = useCallback(() => {
    const topicId = viewingTopicId;
    closeTopicModal();
    // Switch to table view
    window.dispatchEvent(new CustomEvent("finetune-set-view-mode", {
      detail: { viewMode: "table" },
    }));
    // After table renders, dispatch focus event to scroll to and highlight the topic
    if (topicId) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vllora_focus_topic", {
          detail: { topicId, topicName: topicDisplayName },
        }));
      }, 200);
    }
  }, [closeTopicModal, viewingTopicId, topicDisplayName]);

  const recordCountText = `${filteredRecords.length}${filteredRecords.length !== topicRecords.length ? ` of ${topicRecords.length}` : ""} record${topicRecords.length !== 1 ? "s" : ""}`;

  return (
    <div className="w-[clamp(320px,35%,500px)] border-l border-border flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{topicDisplayName}</h3>
          <p className="text-xs text-muted-foreground">
            {recordCountText}
            {isParentTopic && " across child topics"}
          </p>
        </div>
        <button
          type="button"
          onClick={closeTopicModal}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
          title="Close panel (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-7 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
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
        />
      </div>

      {/* Footer: sibling nav + Open Full View */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-1">
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
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-xs"
          onClick={handleViewInTable}
        >
          <TableProperties className="h-3.5 w-3.5" />
          View in Table
        </Button>
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
