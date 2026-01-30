/**
 * TopicRecordsDialog
 *
 * Modal dialog for viewing and managing records of a specific topic.
 * Uses RecordsTable component for displaying records with full functionality.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FolderTree } from "lucide-react";
import { RecordsTable } from "../records-table/RecordsTable";
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
  datasetId?: string;
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
  datasetId,
  availableTopics = [],
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
}: TopicRecordsDialogProps) {
  // Default handlers if not provided
  const handleUpdateTopic = onUpdateRecordTopic ?? (async () => {});
  const handleDelete = onDeleteRecord ?? (() => {});

  // Description varies based on whether this is a parent topic or leaf topic
  const recordCountText = `${records.length} record${records.length !== 1 ? "s" : ""}`;
  const description = isParentTopic
    ? `${recordCountText} across all child topics`
    : `${recordCountText} in this topic`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <div className="flex-1 overflow-hidden min-h-0">
          <RecordsTable
            records={records}
            datasetId={datasetId}
            showHeader={false}
            showFooter={true}
            height="auto"
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
