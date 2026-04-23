/**
 * TopicRecordsDialog
 *
 * Modal dialog for viewing and managing records of a specific topic.
 * Uses RecordsTable component for displaying records with full functionality.
 *
 * P0-1: Now includes selection support, header with select-all, and bulk actions bar.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderTree, Trash2, Search, X } from "lucide-react";
import { RecordsTable } from "../records-table/RecordsTable";
import { filterRecords, type RecordFilterOptions } from "../record-filters";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import type { AvailableTopic } from "../record-utils";

interface TopicRecordsDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Handler for dialog open state change */
  onOpenChange: (open: boolean) => void;
  /** The topic name being viewed */
  topicName: string;
  /** Records belonging to this topic */
  records: DatasetRecord[];
  /** Whether this is a parent topic (shows aggregated records from children) */
  isParentTopic?: boolean;
  /** Subtree hierarchy for parent topics (children of the current topic) */
  subtreeHierarchy?: TopicHierarchyNode[];
  /** Dataset ID */
  workflowId?: string;
  /** Available topics for reassignment */
  availableTopics?: AvailableTopic[];
  /** Handler for updating a record's topic */
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  /** Handler for deleting a record */
  onDeleteRecord?: (recordId: string) => void;
  /** Handler for saving record data */
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
}

export function TopicRecordsDialog({
  open,
  onOpenChange,
  topicName,
  records,
  isParentTopic = false,
  subtreeHierarchy,
  workflowId,
  availableTopics = [],
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
}: TopicRecordsDialogProps) {
  // Default handlers if not provided
  const handleUpdateTopic = onUpdateRecordTopic ?? (async () => {});
  const handleDelete = onDeleteRecord ?? (() => {});

  // P0-1: Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // P0-1: Search/filter state for dialog
  const [searchQuery, setSearchQuery] = useState("");

  // Filter records based on search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const options: RecordFilterOptions = { search: searchQuery };
    return filterRecords(records, options);
  }, [records, searchQuery]);

  // Clear selection when dialog closes
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedIds(new Set());
      setSearchQuery("");
    }
    onOpenChange(nextOpen);
  }, [onOpenChange]);

  // P0-1: Bulk delete handler
  const handleBulkDelete = useCallback(() => {
    if (!onDeleteRecord) return;
    for (const id of selectedIds) {
      onDeleteRecord(id);
    }
    setSelectedIds(new Set());
  }, [selectedIds, onDeleteRecord]);

  // Description varies based on whether this is a parent topic or leaf topic
  const recordCountText = `${filteredRecords.length}${filteredRecords.length !== records.length ? ` of ${records.length}` : ""} record${records.length !== 1 ? "s" : ""}`;
  const description = isParentTopic
    ? `${recordCountText} across all child topics`
    : `${recordCountText} in this topic`;

  const hasSelection = selectedIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            {topicName}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* P0-1: Search bar and bulk actions */}
        <div className="flex items-center gap-2 pb-2">
          {/* Search */}
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

          {/* Bulk actions (visible when records are selected) */}
          {hasSelection && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1 text-xs text-destructive hover:text-destructive"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          <RecordsTable
            records={filteredRecords}
            workflowId={workflowId}
            showHeader={true}
            showFooter={true}
            height="auto"
            selectable={true}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            groupByTopic={isParentTopic}
            topicHierarchy={subtreeHierarchy}
            onUpdateTopic={handleUpdateTopic}
            onDelete={handleDelete}
            onSave={onSaveRecord}
            availableTopics={availableTopics}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
