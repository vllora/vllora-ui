/**
 * KnowledgeSourcesPanel
 *
 * Panel for viewing knowledge sources at the folder level (`knowledge/`).
 * Features:
 * - Global search across all sources and parts (search-first access)
 * - Stats summary (source count, part breakdown by type)
 * - Source cards with expand/collapse
 * - Search results navigate directly to individual parts
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Loader2, Search, X, Type, Table2, ImageIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDebounceFn } from "ahooks";
import { emitter } from "@/utils/eventEmitter";
import { knowledgeSourceService } from "@/services/service-registry";
import type { KnowledgeSource, KnowledgeSourcePart } from "@/types/knowledge-types";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { computeSourceRecordStats } from "@/lib/distri-finetune-tools/steps/shared/source-record-counts";
import { KnowledgeSourceCard } from "./KnowledgeSourceCard";

// ─── Search result type ───

interface SearchResult {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly part: KnowledgeSourcePart;
  readonly matchContext: string;
}

// ─── Part type icon helper ───

function PartTypeIcon({ type, className }: { readonly type: string; readonly className?: string }) {
  if (type === "table") return <Table2 className={cn("w-3 h-3 text-amber-400", className)} />;
  if (type === "image") return <ImageIcon className={cn("w-3 h-3 text-purple-400", className)} />;
  return <Type className={cn("w-3 h-3 text-green-400", className)} />;
}

// ─── Stats bar ───

function StatsBar({ sources }: { readonly sources: readonly KnowledgeSource[] }) {
  const stats = useMemo(() => {
    let text = 0;
    let table = 0;
    let image = 0;
    for (const s of sources) {
      for (const p of s.parts) {
        if (p.type === "text") text++;
        else if (p.type === "table") table++;
        else if (p.type === "image") image++;
      }
    }
    return { text, table, image, total: text + table + image };
  }, [sources]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 text-[10px] text-muted-foreground/60">
      <span>{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
      <span className="text-border">|</span>
      <span>{stats.total} part{stats.total !== 1 ? "s" : ""}</span>
      {stats.text > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Type className="w-2.5 h-2.5 text-green-400/60" /> {stats.text}
        </span>
      )}
      {stats.table > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Table2 className="w-2.5 h-2.5 text-amber-400/60" /> {stats.table}
        </span>
      )}
      {stats.image > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <ImageIcon className="w-2.5 h-2.5 text-purple-400/60" /> {stats.image}
        </span>
      )}
    </div>
  );
}

// ─── Search result card ───

function SearchResultCard({
  result,
  onNavigate,
}: {
  readonly result: SearchResult;
  readonly onNavigate: (sourceId: string, partId: string, label: string) => void;
}) {
  const typeLabel = result.part.type === "table" ? "Table" : result.part.type === "image" ? "Image" : "Text";
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/30 transition-colors group"
      onClick={() => onNavigate(result.sourceId, result.part.id, result.part.title || typeLabel)}
    >
      <div className="flex items-center gap-2">
        <PartTypeIcon type={result.part.type} />
        <span className="text-xs font-medium text-foreground truncate">
          {result.part.title || `${typeLabel} part`}
        </span>
        <span className={cn(
          "text-[9px] px-1 py-0.5 rounded font-medium uppercase tracking-wider shrink-0",
          result.part.type === "table" ? "bg-amber-500/10 text-amber-400" :
          result.part.type === "image" ? "bg-purple-500/10 text-purple-400" :
          "bg-green-500/10 text-green-400",
        )}>
          {typeLabel}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <FileText className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
        <span className="text-[10px] text-muted-foreground/50 truncate">{result.sourceName}</span>
      </div>
      {result.matchContext && (
        <p className="text-[10px] text-muted-foreground/60 line-clamp-1 mt-0.5 leading-relaxed">
          {result.matchContext}
        </p>
      )}
    </button>
  );
}

// ─── Main component ───

interface KnowledgeSourcesPanelProps {
  workflowId: string;
  className?: string;
}

export function KnowledgeSourcesPanel({ workflowId, className }: KnowledgeSourcesPanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const { records, dataset } = DatasetDetailConsumer();
  const { openTab } = WorkspaceTabsConsumer();
  const sourceRecordStats = useMemo(
    () => computeSourceRecordStats(records, dataset?.knowledgeCoverageStats),
    [records, dataset?.knowledgeCoverageStats],
  );

  const { run: updateDebouncedQuery } = useDebounceFn(
    (value: string) => setDebouncedQuery(value),
    { wait: 200 },
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    updateDebouncedQuery(value);
  }, [updateDebouncedQuery]);

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

    const handleUpdate = ({ workflowId: updatedId }: { workflowId: string }) => {
      if (updatedId !== workflowId) return;
      fetchSources();
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => { emitter.off("vllora_knowledge_source_updated", handleUpdate); };
  }, [fetchSources, workflowId]);

  // Toggle source expansion
  const toggleExpand = useCallback((sourceId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }, []);

  // Delete a source
  const handleDelete = useCallback(async (sourceId: string) => {
    try {
      await knowledgeSourceService.delete(workflowId, sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      emitter.emit("vllora_knowledge_source_updated", { workflowId });
    } catch (error) {
      console.error("[KnowledgeSourcesPanel] Error deleting source:", error);
    }
  }, [workflowId]);

  // Navigate to a specific part
  const navigateToPart = useCallback((sourceId: string, partId: string, label: string) => {
    openTab(`knowledge/${sourceId}/${partId}`, label);
  }, [openTab]);

  // ─── Global search across all sources and parts ───

  const searchResults = useMemo((): readonly SearchResult[] => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return [];

    const terms = query.split(/\s+/).filter(t => t.length > 1);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];

    for (const source of sources) {
      for (const part of source.parts) {
        const searchable = [
          part.title || "",
          part.content || "",
          source.name,
        ].join(" ").toLowerCase();

        const isMatch = terms.every(t => searchable.includes(t));
        if (!isMatch) continue;

        // Extract match context (first matching snippet)
        const content = part.content || "";
        const firstTermIdx = terms.reduce((min, t) => {
          const idx = content.toLowerCase().indexOf(t);
          return idx >= 0 && idx < min ? idx : min;
        }, content.length);
        const contextStart = Math.max(0, firstTermIdx - 30);
        const matchContext = content.substring(contextStart, contextStart + 120);

        results.push({
          sourceId: source.id,
          sourceName: source.name,
          part,
          matchContext: contextStart > 0 ? `...${matchContext}` : matchContext,
        });
      }
    }

    return results.slice(0, 20); // Cap at 20 results
  }, [sources, debouncedQuery]);

  const isSearching = debouncedQuery.trim().length > 0;

  // ─── Render ───

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

      {/* Search bar + stats (only when there are sources) */}
      {sources.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search across all sources and parts..."
                className="w-full pl-8 pr-8 py-1.5 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--theme-500))]"
              />
              {searchInput && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                  onClick={() => handleSearchChange("")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <StatsBar sources={sources} />
        </>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h4 className="text-sm font-medium text-foreground mb-1">No reference documents yet</h4>
            <p className="text-xs text-muted-foreground max-w-[280px] mb-3">
              Lucy will add knowledge sources as part of the finetune workflow.
            </p>
          </div>
        ) : isSearching ? (
          /* Search results — direct navigation to parts */
          <div>
            <p className="text-[10px] text-muted-foreground/60 mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              {searchResults.length === 20 && " (showing first 20)"}
            </p>
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <span className="text-sm">No matches for &ldquo;{debouncedQuery}&rdquo;</span>
                <button
                  type="button"
                  className="text-xs text-[rgb(var(--theme-500))] hover:underline"
                  onClick={() => handleSearchChange("")}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {searchResults.map((result) => (
                  <SearchResultCard
                    key={`${result.sourceId}:${result.part.id}`}
                    result={result}
                    onNavigate={navigateToPart}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Default: source cards */
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
