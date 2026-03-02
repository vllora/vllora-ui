/**
 * KnowledgeSourcesPanel
 *
 * Panel for viewing and managing knowledge sources (uploaded docs) for a dataset.
 * Shows uploaded PDFs, documents, and their extracted content/topics.
 * Supports file upload with optional comment/objective.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { RefreshCw, Upload, Loader2, Plus, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import type { KnowledgeSource, KnowledgeSourceType } from "@/types/dataset-types";
import { toast } from "sonner";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { computeSourceRecordStats } from "@/lib/distri-finetune-tools/steps/shared/source-record-counts";
import { KnowledgeSourceCard } from "./KnowledgeSourceCard";
import { uploadKnowledgeSourceHandler } from "@/lib/distri-finetune-tools/steps/knowledge-sources";

interface KnowledgeSourcesPanelProps {
  datasetId: string;
  className?: string;
}

/** Map MIME types to KnowledgeSourceType */
function getSourceType(file: File): KnowledgeSourceType {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (file.name.endsWith(".md")) return "markdown";
  return "text";
}

/** Read a File as base64 string */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_TYPES = ".pdf,.md,.txt,.text";

export function KnowledgeSourcesPanel({ datasetId, className }: KnowledgeSourcesPanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Access records and dataset for source-to-record stats
  const { records, dataset } = DatasetDetailConsumer();
  const { planStatus } = PlanConsumer();
  const sourceRecordStats = useMemo(
    () => computeSourceRecordStats(records, dataset?.knowledgeCoverageStats),
    [records, dataset?.knowledgeCoverageStats],
  );

  // Staged upload state: files selected but not yet uploaded
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");

  // Fetch knowledge sources
  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
      setSources(data);
    } catch (error) {
      console.error("[KnowledgeSourcesPanel] Error fetching sources:", error);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    fetchSources();

    const handleUpdate = ({
      datasetId: updatedDatasetId,
      sourceId,
      progress,
    }: {
      datasetId: string;
      sourceId?: string;
      progress?: { step: string; current?: number; total?: number; percent?: number };
    }) => {
      if (updatedDatasetId !== datasetId) return;

      if (sourceId && progress) {
        setSources((prev) =>
          prev.map((s) => (s.id === sourceId ? { ...s, progress } : s))
        );
      } else {
        fetchSources();
      }
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleUpdate);
    };
  }, [fetchSources, datasetId]);

  // Stage files when selected via file input
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setStagedFiles(Array.from(files));
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Cancel staged upload
  const cancelStaged = useCallback(() => {
    setStagedFiles([]);
    setComment("");
  }, []);

  // Confirm upload with optional comment
  const confirmUpload = useCallback(async () => {
    if (stagedFiles.length === 0) return;
    setUploading(true);

    try {
      for (const file of stagedFiles) {
        const base64 = await readFileAsBase64(file);
        const sourceType = getSourceType(file);

        await uploadKnowledgeSourceHandler({
          dataset_id: datasetId,
          name: file.name,
          type: sourceType,
          content: base64,
          mime_type: file.type,
          comment: comment.trim() || undefined,
          extraction_mode: "llm",
        });
      }
      await fetchSources();

      // Plan-status-aware feedback after successful upload
      if (planStatus === "executing") {
        toast.info("Document uploaded. Lucy will incorporate it in the next round.");
      } else if (planStatus === "completed") {
        emitter.emit("vllora_lucy_prompt", {
          prompt: "I've uploaded new documents. Please analyze them and suggest how to incorporate them into my existing dataset.",
        });
      }
    } catch (error) {
      console.error("[KnowledgeSourcesPanel] Upload error:", error);
    } finally {
      setUploading(false);
      setStagedFiles([]);
      setComment("");
    }
  }, [stagedFiles, comment, datasetId, fetchSources, planStatus]);

  // Toggle source expansion
  const toggleExpand = (sourceId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  // Delete a source
  const handleDelete = async (sourceId: string) => {
    try {
      await knowledgeDB.deleteKnowledgeSource(sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      emitter.emit("vllora_knowledge_source_updated", { datasetId });
    } catch (error) {
      console.error("[KnowledgeSourcesPanel] Error deleting source:", error);
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading documents...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-medium">Knowledge Sources</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reference documents that Lucy uses to generate accurate training data
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || stagedFiles.length > 0}
            className="h-8 gap-1.5 text-xs"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Upload
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchSources} className="h-8 w-8 p-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Staged upload area */}
      {stagedFiles.length > 0 && (
        <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-3">
          {/* File list */}
          <div className="space-y-1.5">
            {stagedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-foreground truncate">{file.name}</span>
                <span className="text-muted-foreground shrink-0">({formatFileSize(file.size)})</span>
              </div>
            ))}
          </div>

          {/* Comment input */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: Describe what this document is about or how Lucy should use it..."
            className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[rgba(var(--theme-500),0.5)] placeholder:text-muted-foreground/60"
            rows={2}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={confirmUpload}
              disabled={uploading}
              className="h-7 text-xs gap-1.5"
            >
              {uploading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelStaged}
              disabled={uploading}
              className="h-7 text-xs gap-1"
            >
              <X className="w-3 h-3" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sources.length === 0 && stagedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div
              className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center mb-4 cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <h4 className="text-sm font-medium text-foreground mb-1">No reference documents yet</h4>
            <p className="text-xs text-muted-foreground max-w-[280px] mb-3">
              Upload PDFs, markdown, or text files. Lucy uses these to generate more accurate, grounded training data.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => {
              const stats = sourceRecordStats.get(source.id);
              return (
                <KnowledgeSourceCard
                  key={source.id}
                  source={source}
                  isExpanded={expandedSources.has(source.id)}
                  onToggleExpand={() => toggleExpand(source.id)}
                  onDelete={() => handleDelete(source.id)}
                  recordCount={stats?.recordCount}
                  coveragePercent={stats?.coveragePercent}
                  onFilterBySource={() => {
                    emitter.emit("vllora_filter_by_source", { datasetId, sourceId: source.id });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
