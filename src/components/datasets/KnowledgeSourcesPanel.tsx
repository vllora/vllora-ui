/**
 * KnowledgeSourcesPanel
 *
 * Panel for viewing and managing knowledge sources (uploaded docs) for a dataset.
 * Shows uploaded PDFs, documents, and their extracted content/topics.
 */

import { useState, useEffect, useCallback } from "react";
import { FileText, Trash2, RefreshCw, Upload, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import type { KnowledgeSource } from "@/types/dataset-types";

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

  // Get status badge color
  const getStatusColor = (status: KnowledgeSource["status"]) => {
    switch (status) {
      case "ready":
        return "bg-green-500/20 text-green-500";
      case "processing":
        return "bg-amber-500/20 text-amber-500";
      case "failed":
        return "bg-red-500/20 text-red-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Get file type icon color
  const getTypeColor = (type: KnowledgeSource["type"]) => {
    switch (type) {
      case "pdf":
        return "text-red-500";
      case "image":
        return "text-blue-500";
      case "url":
        return "text-purple-500";
      default:
        return "text-muted-foreground";
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
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchSources}
          className="h-8 w-8 p-0"
        >
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
            {sources.map((source) => {
              const isExpanded = expandedSources.has(source.id);
              const hasContent = source.extractedContent && (
                source.extractedContent.text ||
                (source.extractedContent.topics && source.extractedContent.topics.length > 0) ||
                (source.extractedContent.sections && source.extractedContent.sections.length > 0)
              );

              return (
                <div
                  key={source.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  {/* Source header */}
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 bg-card",
                      hasContent && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={() => hasContent && toggleExpand(source.id)}
                  >
                    {/* Expand/collapse icon */}
                    {hasContent ? (
                      isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )
                    ) : (
                      <div className="w-4" />
                    )}

                    {/* File icon */}
                    <FileText className={cn("w-5 h-5 shrink-0", getTypeColor(source.type))} />

                    {/* Name and type */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.type.toUpperCase()}
                        {source.extractedContent?.topics && source.extractedContent.topics.length > 0 && (
                          <> &middot; {source.extractedContent.topics.length} topics</>
                        )}
                        {source.extractedContent?.sections && source.extractedContent.sections.length > 0 && (
                          <> &middot; {source.extractedContent.sections.length} sections</>
                        )}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-medium rounded-full uppercase",
                        getStatusColor(source.status)
                      )}
                    >
                      {source.status}
                    </span>

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(source.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && hasContent && (
                    <div className="border-t border-border bg-muted/30 p-3 space-y-3">
                      {/* Topics */}
                      {source.extractedContent?.topics && source.extractedContent.topics.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Extracted Topics
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {source.extractedContent.topics.slice(0, 15).map((topic, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-500 rounded-full"
                              >
                                {topic}
                              </span>
                            ))}
                            {source.extractedContent.topics.length > 15 && (
                              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                                +{source.extractedContent.topics.length - 15} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Sections */}
                      {source.extractedContent?.sections && source.extractedContent.sections.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Document Sections
                          </p>
                          <div className="space-y-1">
                            {source.extractedContent.sections.slice(0, 8).map((section, i) => (
                              <div key={i} className="text-xs">
                                <span className="font-medium">{section.title}</span>
                                {section.content && (
                                  <span className="text-muted-foreground ml-1">
                                    - {section.content.substring(0, 80)}...
                                  </span>
                                )}
                              </div>
                            ))}
                            {source.extractedContent.sections.length > 8 && (
                              <p className="text-xs text-muted-foreground">
                                +{source.extractedContent.sections.length - 8} more sections
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Text preview */}
                      {source.extractedContent?.text && !source.extractedContent.sections?.length && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Content Preview
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-4">
                            {source.extractedContent.text.substring(0, 500)}...
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
