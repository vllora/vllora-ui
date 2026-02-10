/**
 * KnowledgeSourcesUpload
 *
 * Reusable component for uploading knowledge source files (PDF, TXT, MD).
 * Supports drag & drop, file selection, and displays uploaded files.
 * Used in both ObjectiveInputTab and ApiInitializeTab.
 */

import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Upload, X, FileText } from "lucide-react";

const ACCEPTED_TYPES = ["application/pdf", "text/plain"];
const ACCEPTED_EXTENSIONS = [".md"];

export interface KnowledgeSourcesUploadRef {
  files: File[];
  isDragOver: boolean;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
}

interface KnowledgeSourcesUploadProps {
  onFilesChange?: (files: File[]) => void;
}

export const KnowledgeSourcesUpload = forwardRef<KnowledgeSourcesUploadRef, KnowledgeSourcesUploadProps>(
  ({ onFilesChange }, ref) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);

    const updateFiles = useCallback((newFiles: File[]) => {
      setFiles(newFiles);
      onFilesChange?.(newFiles);
    }, [onFilesChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (f) => ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXTENSIONS.some(ext => f.name.endsWith(ext))
      );
      if (droppedFiles.length > 0) {
        updateFiles([...files, ...droppedFiles]);
      }
    }, [files, updateFiles]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
    }, []);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      if (selectedFiles.length > 0) {
        updateFiles([...files, ...selectedFiles]);
      }
      e.target.value = "";
    }, [files, updateFiles]);

    const removeFile = useCallback((index: number) => {
      updateFiles(files.filter((_, i) => i !== index));
    }, [files, updateFiles]);

    // Expose handlers for parent components to use on their containers
    useImperativeHandle(ref, () => ({
      files,
      isDragOver,
      handleDrop,
      handleDragOver,
      handleDragLeave,
    }), [files, isDragOver, handleDrop, handleDragOver, handleDragLeave]);

    return (
      <>
        {/* Drag overlay - parent should position this */}
        {isDragOver && (
          <DragOverlay />
        )}

        {/* File list display */}
        {files.length > 0 && (
          <FileList files={files} onRemove={removeFile} />
        )}

        {/* Add docs button for footer */}
        <AddDocsButton onFileInput={handleFileInput} />
      </>
    );
  }
);

KnowledgeSourcesUpload.displayName = "KnowledgeSourcesUpload";

// Sub-components for flexibility

export function DragOverlay() {
  return (
    <div className="absolute inset-0 bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center pointer-events-none z-10">
      <div className="flex items-center gap-2 text-[rgb(var(--theme-500))] font-medium">
        <Upload className="w-5 h-5" />
        Drop files here
      </div>
    </div>
  );
}

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
  className?: string;
}

export function FileList({ files, onRemove, className }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className={`px-5 py-3 border-t border-border/30 bg-muted/10 ${className || ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Knowledge sources:</span>
        {files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[rgba(var(--theme-500),0.1)] border border-[rgba(var(--theme-500),0.2)] text-xs"
          >
            <FileText className="w-3 h-3 text-[rgb(var(--theme-500))]" />
            <span className="max-w-[150px] truncate">{file.name}</span>
            <button
              onClick={() => onRemove(index)}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AddDocsButtonProps {
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AddDocsButton({ onFileInput }: AddDocsButtonProps) {
  return (
    <label className="cursor-pointer">
      <input
        type="file"
        multiple
        accept=".pdf,.txt,.md"
        onChange={onFileInput}
        className="hidden"
      />
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Upload className="w-3.5 h-3.5" />
        Add docs
      </span>
    </label>
  );
}

// Hook for simpler usage
export function useKnowledgeSourcesUpload(onFilesChange?: (files: File[]) => void) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const updateFiles = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    onFilesChange?.(newFiles);
  }, [onFilesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXTENSIONS.some(ext => f.name.endsWith(ext))
    );
    if (droppedFiles.length > 0) {
      updateFiles([...files, ...droppedFiles]);
    }
  }, [files, updateFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      updateFiles([...files, ...selectedFiles]);
    }
    e.target.value = "";
  }, [files, updateFiles]);

  const removeFile = useCallback((index: number) => {
    updateFiles(files.filter((_, i) => i !== index));
  }, [files, updateFiles]);

  return {
    files,
    isDragOver,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInput,
    removeFile,
  };
}
