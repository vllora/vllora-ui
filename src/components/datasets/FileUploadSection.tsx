/**
 * FileUploadSection
 *
 * Handles file upload via drag-and-drop or file browser.
 * Displays either a drop zone or the uploaded records list.
 */

import { Button } from "@/components/ui/button";
import { FileJson } from "lucide-react";
import { UploadedRecordsSection } from "./UploadedRecordsSection";
import { type UploadedRecord } from "./UploadedRecordsList";

export interface FileUploadSectionProps {
  uploadedRecords: UploadedRecord[];
  uploadFileName: string | null;
  selectedIds: Set<string>;
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileUpload: (file: File) => void;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
  onClear: () => void;
}

export function FileUploadSection({
  uploadedRecords,
  uploadFileName,
  selectedIds,
  isDragging,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileUpload,
  onToggleSelectAll,
  onToggleSelection,
  onClear,
}: FileUploadSectionProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {uploadedRecords.length === 0 ? (
        // Drop zone
        <div
          className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
          }`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <FileJson className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">Drop your .jsonl file here</p>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse
          </p>
          <input
            type="file"
            accept=".jsonl"
            className="hidden"
            id="file-upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileUpload(file);
            }}
          />
          <Button variant="outline" asChild>
            <label htmlFor="file-upload" className="cursor-pointer">
              Browse Files
            </label>
          </Button>
        </div>
      ) : (
        <UploadedRecordsSection
          fileName={uploadFileName!}
          records={uploadedRecords}
          selectedIds={selectedIds}
          onToggleSelectAll={onToggleSelectAll}
          onToggleSelection={onToggleSelection}
          onClear={onClear}
        />
      )}
    </div>
  );
}
