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
import type { DatasetRecord } from "@/types/dataset-types";
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
  datasetId,
  availableTopics = [],
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
}: TopicRecordsDialogProps) {
  // Default handlers if not provided
  const handleUpdateTopic = onUpdateRecordTopic ?? (async () => {});
  const handleDelete = onDeleteRecord ?? (() => {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            {topicName}
          </DialogTitle>
          <DialogDescription>
            {records.length} record{records.length !== 1 ? "s" : ""} in this topic
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          <RecordsTable
            records={records}
            datasetId={datasetId}
            showHeader={false}
            showFooter={true}
            height="auto"
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
