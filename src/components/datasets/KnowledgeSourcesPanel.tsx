/**
 * KnowledgeSourcesPanel
 *
 * Panel for viewing and managing knowledge sources for a dataset.
 * Shows knowledge sources and their parts. In skill-first mode,
 * sources are written by the skill (no client-side upload).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { knowledgeSourceService } from "@/services/service-registry";
import type { KnowledgeSource } from "@/types/knowledge-types";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { computeSourceRecordStats } from "@/lib/distri-finetune-tools/steps/shared/source-record-counts";
import { KnowledgeSourceCard } from "./KnowledgeSourceCard";

interface KnowledgeSourcesPanelProps {
  workflowId: string;
  className?: string;
}

export function KnowledgeSourcesPanel({ workflowId, className }: KnowledgeSourcesPanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  // Access records and dataset for source-to-record stats
  const { records, dataset } = DatasetDetailConsumer();
  const sourceRecordStats = useMemo(
    () => computeSourceRecordStats(records, dataset?.knowledgeCoverageStats),
    [records, dataset?.knowledgeCoverageStats],
  );

  // Fetch knowledge sources
  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgeSourceService.list(workflowId);
      setSources(data);
    } catch (error) {
      console.error("[KnowledgeSourcesPanel] Error fetching sources:", error);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchSources();

    const handleUpdate = ({
      workflowId: updatedDatasetId,
    }: {
      workflowId: string;
    }) => {
      if (updatedDatasetId !== workflowId) return;
      fetchSources();
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleUpdate);
    };
  }, [fetchSources, workflowId]);

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
      await knowledgeSourceService.delete(workflowId, sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      emitter.emit("vllora_knowledge_source_updated", { workflowId });
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
            Reference documents that Lucy uses to generate accurate training data
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={fetchSources} className="h-8 w-8 p-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h4 className="text-sm font-medium text-foreground mb-1">No reference documents yet</h4>
            <p className="text-xs text-muted-foreground max-w-[280px] mb-3">
              Lucy will add knowledge sources as part of the finetune workflow.
            </p>
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
                    emitter.emit("vllora_filter_by_source", { workflowId, sourceId: source.id });
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
