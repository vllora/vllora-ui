/**
 * UploadedRecordsSection
 *
 * Displays uploaded file info header and the records table.
 * Used in the Upload File tab of the dataset creation flow.
 */

import { Button } from "@/components/ui/button";
import { FileJson, X } from "lucide-react";
import { UploadedRecordsList, type UploadedRecord } from "./UploadedRecordsList";

export interface UploadedRecordsSectionProps {
  fileName: string;
  records: UploadedRecord[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
  onClear: () => void;
}

export function UploadedRecordsSection({
  fileName,
  records,
  selectedIds,
  onToggleSelectAll,
  onToggleSelection,
  onClear,
}: UploadedRecordsSectionProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* File info header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{fileName}</span>
          <span className="text-sm text-muted-foreground">
            ({records.length} records)
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>

      {/* Records table */}
      <UploadedRecordsList
        records={records}
        selectedIds={selectedIds}
        onToggleSelectAll={onToggleSelectAll}
        onToggleSelection={onToggleSelection}
      />
    </div>
  );
}
