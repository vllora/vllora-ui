/**
 * KnowledgeSourcesPanel
 *
 * Panel for viewing and managing knowledge sources (uploaded docs) for a dataset.
 * Shows uploaded PDFs, documents, and their extracted content/topics.
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import type { KnowledgeSource } from "@/types/dataset-types";
import { KnowledgeSourceCard } from "./KnowledgeSourceCard";

interface KnowledgeSourcesPanelProps {
  datasetId: string;
  className?: string;
}

export function KnowledgeSourcesPanel({ datasetId, className }: KnowledgeSourcesPanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

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

    // Listen for knowledge source updates (e.g., from Lucy uploads)
    const handleUpdate = ({ datasetId: updatedDatasetId }: { datasetId: string }) => {
      if (updatedDatasetId === datasetId) {
        fetchSources();
      }
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleUpdate);
    };
  }, [fetchSources, datasetId]);

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
      // Emit event to update count in other components
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-medium">Knowledge Sources</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload documents to ground your training data generation
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchSources} className="h-8 w-8 p-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <h4 className="text-sm font-medium text-foreground mb-1">No documents uploaded</h4>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Upload PDFs or documents in the chat to use them for grounded data generation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <KnowledgeSourceCard
                key={source.id}
                source={source}
                isExpanded={expandedSources.has(source.id)}
                onToggleExpand={() => toggleExpand(source.id)}
                onDelete={() => handleDelete(source.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
