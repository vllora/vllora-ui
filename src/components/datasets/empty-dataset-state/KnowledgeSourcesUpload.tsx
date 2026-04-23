/**
 * KnowledgeSourcesUpload
 *
 * Reusable component for uploading knowledge source files (PDF, TXT, MD).
 * Supports drag & drop, file selection, and displays uploaded files.
 * Used in both ObjectiveInputTab and ApiInitializeTab.
 */

import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Upload, X } from "lucide-react";

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
    <div className="absolute inset-0 bg-[rgba(var(--theme-500),0.08)] backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-10 rounded-2xl border-2 border-dashed border-[rgba(var(--theme-500),0.4)]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center">
          <Upload className="w-6 h-6 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[rgb(var(--theme-500))]">Drop files here</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">PDFs, TXT, or MD files</p>
        </div>
      </div>
    </div>
  );
}

// File extension color map
const FILE_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pdf: { bg: "bg-orange-500/10", text: "text-orange-400", label: "PDF" },
  txt: { bg: "bg-sky-500/10", text: "text-sky-400", label: "TXT" },
  md: { bg: "bg-violet-500/10", text: "text-violet-400", label: "MD" },
};

function getFileInfo(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const colors = FILE_TYPE_COLORS[ext] || { bg: "bg-muted", text: "text-muted-foreground", label: ext.toUpperCase() };
  const size = file.size < 1024
    ? `${file.size} B`
    : file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(0)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  return { ext, colors, size };
}

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
  className?: string;
}

export function FileList({ files, onRemove, className }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className={`px-4 pb-3 pt-1 ${className || ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {files.map((file, index) => {
          const { colors, size } = getFileInfo(file);
          return (
            <div
              key={`${file.name}-${index}`}
              className="group/file flex items-center gap-2.5 pl-2.5 pr-1.5 py-1.5 rounded-xl bg-card border border-border/60 hover:border-border transition-colors"
            >
              {/* File type badge */}
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${colors.bg} shrink-0`}>
                <span className={`text-[10px] font-bold ${colors.text}`}>{colors.label}</span>
              </div>

              {/* File info */}
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] font-medium text-foreground/90 max-w-[160px] truncate leading-tight">
                  {file.name}
                </span>
                <span className="text-[10px] text-muted-foreground/50 leading-tight">
                  {size}
                </span>
              </div>

              {/* Remove button */}
              <button
                onClick={() => onRemove(index)}
                className="flex items-center justify-center w-5 h-5 rounded-md opacity-0 group-hover/file:opacity-100 hover:bg-muted/80 transition-all ml-0.5 shrink-0"
                title="Remove file"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          );
        })}
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
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" title="Attach reference documents (PDFs, text files) to help Lucy generate better training data">
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
