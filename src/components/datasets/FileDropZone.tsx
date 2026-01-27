/**
 * FileDropZone
 *
 * Reusable file drop zone component for uploading JSON/JSONL files.
 * Shows different states: idle, parsing, success, and error.
 */

import { useRef } from "react";
import { Upload, FileJson, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export type ParseStatus = "idle" | "parsing" | "success" | "error";

interface FileDropZoneProps {
  /** Current parse status */
  parseStatus: ParseStatus;
  /** Error message when parseStatus is "error" */
  parseError?: string | null;
  /** The selected file (shown when status is "success") */
  file?: File | null;
  /** Number of records parsed (shown when status is "success") */
  recordCount?: number;
  /** Called when a file is selected or dropped */
  onFileSelect: (file: File) => void;
  /** Accepted file types (default: ".json,.jsonl") */
  accept?: string;
  /** Custom idle message */
  idleMessage?: string;
  /** Custom idle hint */
  idleHint?: string;
}

export function FileDropZone({
  parseStatus,
  parseError,
  file,
  recordCount = 0,
  onFileSelect,
  accept = ".json,.jsonl",
  idleMessage = "Drop a file here or click to browse",
  idleHint = "Supports .json and .jsonl files",
}: FileDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Check if file matches accepted types
      const acceptedExtensions = accept.split(",").map(ext => ext.trim());
      const fileExtension = `.${droppedFile.name.split(".").pop()}`;
      if (acceptedExtensions.some(ext => fileExtension.endsWith(ext.replace(".", "")))) {
        onFileSelect(droppedFile);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
        transition-colors
        ${parseStatus === "success" ? "border-green-500/50 bg-green-500/5" : ""}
        ${parseStatus === "error" ? "border-red-500/50 bg-red-500/5" : ""}
        ${parseStatus === "idle" || parseStatus === "parsing" ? "border-border hover:border-[rgb(var(--theme-500))] hover:bg-muted/50" : ""}
      `}
      onClick={() => fileInputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />

      {parseStatus === "idle" && (
        <>
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{idleMessage}</p>
          <p className="text-xs text-muted-foreground mt-1">{idleHint}</p>
        </>
      )}

      {parseStatus === "parsing" && (
        <>
          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Parsing file...</p>
        </>
      )}

      {parseStatus === "success" && file && (
        <>
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
          <div className="flex items-center justify-center gap-2 mb-1">
            <FileJson className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{file.name}</span>
          </div>
          <p className="text-sm text-green-600">
            {recordCount} record{recordCount !== 1 ? "s" : ""} ready to import
          </p>
        </>
      )}

      {parseStatus === "error" && (
        <>
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-500">{parseError}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click to try another file
          </p>
        </>
      )}
    </div>
  );
}
