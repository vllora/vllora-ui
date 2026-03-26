/**
 * SourcesView
 *
 * Knowledge sources browsing page (Page 2 of the 3-page redesign).
 * Two modes driven by sidebar selection:
 * - "all": Coverage overview with all source cards
 * - specific source: Single document view with topic coverage bars + parts outline
 *
 * Implements I1-I5 from redesign spec:
 * - I1: Topic coverage bars in SingleDocView
 * - I2: Parts grouped by extractionPath
 * - I3: Prev/next navigation in PartViewer
 * - I4: Rendered markdown via react-markdown
 * - I5: Footer with topic chips + records count
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { FileText, Tags, ChevronRight, ChevronLeft, ArrowLeft, Search, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { knowledgeSourceService } from "@/services/service-registry";
// CoverageMatrix replaced by inline hierarchical matrix in AllSourcesView
import type { KnowledgeSource, KnowledgeSourcePart } from "@/types/knowledge-types";
import type { TopicHierarchyNode, DatasetRecord } from "@/types/dataset-types";

interface SourcesViewProps {
  /** Currently selected source ID (null = all sources view) */
  readonly selectedSourceId?: string | null;
  /** Part ID to focus/scroll to when navigating from record table */
  readonly focusPartId?: string | null;
  /** "Back to record" context — shows banner when navigated from record table */
  readonly backTo?: { viewMode: string; topicFilter?: string; recordId?: string } | null;
  /** Called when user clicks "Back to record" banner */
  readonly onBackToRecord?: () => void;
  /** Called when user selects a source from AllSourcesView cards/matrix */
  readonly onSelectSource?: (sourceId: string) => void;
}

export function SourcesView({ selectedSourceId, focusPartId, backTo, onBackToRecord, onSelectSource }: SourcesViewProps) {
  const { sources, count, totalParts } = KnowledgeSourcesConsumer();

  const activeSource = selectedSourceId
    ? sources.find(s => s.id === selectedSourceId)
    : null;

  // When a source is selected from the AllSourcesView cards/matrix,
  // notify parent so explorer sidebar can update its selection
  const handleSelectSource = useCallback((sourceId: string) => {
    onSelectSource?.(sourceId);
  }, [onSelectSource]);

  if (count === 0) {
    return <SourcesEmptyState />;
  }

  // No internal sidebar — explorer sidebar handles document navigation
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Back to record banner */}
      {backTo && onBackToRecord && (
        <BackToRecordBanner onClick={onBackToRecord} />
      )}
      <div className="flex-1 overflow-hidden">
        {activeSource ? (
          <SingleDocView source={activeSource} focusPartId={focusPartId} />
        ) : (
          <AllSourcesView sources={sources} totalParts={totalParts} onSelectSource={handleSelectSource} />
        )}
      </div>
    </div>
  );
}

// ─── All Sources View ───

function AllSourcesView({
  sources,
  totalParts,
  onSelectSource,
}: {
  readonly sources: readonly KnowledgeSource[];
  readonly totalParts: number;
  readonly onSelectSource: (id: string) => void;
}) {
  const { dataset } = DatasetDetailConsumer();
  const hierarchy = dataset?.topicHierarchy?.hierarchy;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const totalChars = useMemo(
    () => sources.reduce((sum, src) => sum + src.parts.reduce((s, p) => s + (p.content?.length ?? 0), 0), 0),
    [sources],
  );

  // Build hierarchical coverage data: per topic × per source
  const { flatTopics, coverageGaps, totalTopics } = useMemo(() => {
    if (!hierarchy) return { flatTopics: [] as FlatTopicRow[], coverageGaps: 0, totalTopics: 0 };

    const rows: FlatTopicRow[] = [];
    let gaps = 0;
    let total = 0;

    const walkHierarchy = (nodes: TopicHierarchyNode[], depth: number, parentId?: string) => {
      for (const node of nodes) {
        const isParent = (node.children?.length ?? 0) > 0;
        const perSource = new Map<string, number>();

        // Count parts per source for this topic
        const refs = node.sourceChunkRefs ?? [];
        for (const src of sources) {
          const srcPartIds = new Set(src.parts.map(p => p.id));
          const srcPartIdsWithSource = new Set(src.parts.map(p => `${src.id}/${p.id}`));
          let count = 0;
          for (const ref of refs) {
            if (srcPartIds.has(ref) || srcPartIdsWithSource.has(ref)) count++;
          }
          perSource.set(src.id, count);
        }

        const totalCount = Array.from(perSource.values()).reduce((a, b) => a + b, 0);

        // If parent, also aggregate children counts
        let aggregatePerSource = perSource;
        if (isParent) {
          aggregatePerSource = new Map(perSource);
          const aggregateChildren = (children: TopicHierarchyNode[]) => {
            for (const child of children) {
              const childRefs = child.sourceChunkRefs ?? [];
              for (const src of sources) {
                const srcPartIds = new Set(src.parts.map(p => p.id));
                const srcPartIdsWithSource = new Set(src.parts.map(p => `${src.id}/${p.id}`));
                let count = 0;
                for (const ref of childRefs) {
                  if (srcPartIds.has(ref) || srcPartIdsWithSource.has(ref)) count++;
                }
                aggregatePerSource.set(src.id, (aggregatePerSource.get(src.id) ?? 0) + count);
              }
              if (child.children) aggregateChildren(child.children);
            }
          };
          aggregateChildren(node.children!);
        }

        const displayPerSource = isParent ? aggregatePerSource : perSource;
        const displayTotal = Array.from(displayPerSource.values()).reduce((a, b) => a + b, 0);

        // Only count leaf topics for gap detection
        if (!isParent) {
          total++;
          if (totalCount === 0) gaps++;
        }

        rows.push({
          id: node.id ?? node.name,
          name: node.name,
          depth,
          isParent,
          parentId,
          perSource: displayPerSource,
          total: displayTotal,
          isGap: !isParent && totalCount === 0,
        });

        if (node.children) {
          walkHierarchy(node.children, depth + 1, node.id ?? node.name);
        }
      }
    };

    walkHierarchy(hierarchy, 0);
    return { flatTopics: rows, coverageGaps: gaps, totalTopics: total };
  }, [hierarchy, sources]);

  const coveredTopics = totalTopics - coverageGaps;

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Per-source coverage percentage
  const sourceCoveragePercent = useMemo(() => {
    const map = new Map<string, number>();
    for (const src of sources) {
      const coverage = computeTopicCoverage(src, hierarchy);
      map.set(src.id, totalTopics > 0 ? Math.round((coverage.length / totalTopics) * 100) : 0);
    }
    return map;
  }, [sources, hierarchy, totalTopics]);

  const formatChars = (chars: number) =>
    chars >= 1000 ? `${(chars / 1000).toFixed(1)}K` : `${chars}`;

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-5 max-w-[1200px] space-y-5">
        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-5 gap-3">
          <div className="px-4 py-3 rounded-lg border border-border/50 bg-card">
            <div className="text-xl font-bold font-mono text-foreground">{sources.length}</div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">Documents</div>
          </div>
          <div className="px-4 py-3 rounded-lg border border-border/50 bg-card">
            <div className="text-xl font-bold font-mono text-foreground">{totalParts}</div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">Parts Extracted</div>
          </div>
          <div className="px-4 py-3 rounded-lg border border-border/50 bg-card">
            <div className="text-xl font-bold font-mono text-foreground">{formatChars(totalChars)}</div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">Total Characters</div>
          </div>
          <div className="px-4 py-3 rounded-lg border border-border/50 bg-card">
            <div className="text-xl font-bold font-mono text-emerald-400">{coveredTopics} / {totalTopics}</div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">Topics Covered</div>
          </div>
          <div className="px-4 py-3 rounded-lg border border-border/50 bg-card">
            <div className={cn("text-xl font-bold font-mono", coverageGaps > 0 ? "text-amber-400" : "text-emerald-400")}>{coverageGaps}</div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">Coverage Gaps</div>
          </div>
        </div>

        {/* ── Hierarchical Coverage Matrix ── */}
        {flatTopics.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tags className="w-3.5 h-3.5 text-muted-foreground/50" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60">
                Topic × Source Coverage
              </h3>
            </div>
            <TooltipProvider delayDuration={200}>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground/60" style={{ width: 200 }}>Topic</th>
                    {sources.map(src => (
                      <th key={src.id} className="text-center px-2 py-2 font-medium text-muted-foreground/60" style={{ minWidth: 80 }}>
                        <div className="truncate max-w-[100px] mx-auto">{src.description || src.name}</div>
                        <div className="text-[9px] text-muted-foreground/30 font-normal mt-0.5">{src.parts.length} parts</div>
                      </th>
                    ))}
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground/40" style={{ width: 60 }}>Total</th>
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground/40" style={{ width: 70 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {flatTopics.map(topic => {
                    // Hide children of collapsed parents
                    if (topic.parentId && collapsedGroups.has(topic.parentId)) return null;

                    const status = topic.isGap ? "missing" : topic.total >= 3 ? "covered" : "partial";

                    return (
                      <tr
                        key={topic.id}
                        className={cn(
                          "border-t border-border/20 transition-colors",
                          topic.isGap && "bg-red-500/[0.02]",
                          !topic.isGap && "hover:bg-muted/20",
                        )}
                      >
                        {/* Topic name with hierarchy indent */}
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1" style={{ paddingLeft: topic.depth * 16 }}>
                            {topic.isParent ? (
                              <button
                                type="button"
                                onClick={() => toggleGroup(topic.id)}
                                className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                              >
                                {collapsedGroups.has(topic.id)
                                  ? <ChevronRight className="w-3 h-3" />
                                  : <ChevronLeft className="w-3 h-3 rotate-[-90deg]" />
                                }
                              </button>
                            ) : (
                              <span className="w-3" />
                            )}
                            <span className={cn(
                              "truncate",
                              topic.isParent ? "font-semibold text-foreground/80" : "text-muted-foreground/70",
                              topic.isGap && "text-red-400/70",
                            )}>
                              {topic.name}
                            </span>
                          </div>
                        </td>
                        {/* Per-source counts */}
                        {sources.map(src => {
                          const count = topic.perSource.get(src.id) ?? 0;
                          const srcName = src.description || src.name;
                          return (
                            <td key={src.id} className="text-center px-2 py-1.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {count > 0 ? (
                                    <span className={cn(
                                      "inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-[10px] text-[9px] font-mono font-medium cursor-help",
                                      count >= 3 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/12 text-amber-400",
                                    )}>
                                      {count}
                                    </span>
                                  ) : topic.isGap ? (
                                    <span className="text-[9px] text-muted-foreground/20 italic cursor-help">gap</span>
                                  ) : (
                                    <span className="text-muted-foreground/15 cursor-help">—</span>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[260px]">
                                  <p className="text-[11px]">
                                    {count > 0
                                      ? <><span className="font-semibold">{count} extracted part{count !== 1 ? "s" : ""}</span> from "{srcName}" are linked to the topic "{topic.name}". Parts are chunks of the source document matched to this topic.</>
                                      : topic.isGap
                                        ? <>No parts from any source document cover the topic "{topic.name}". Consider adding source material for this topic.</>
                                        : <>No parts from "{srcName}" are linked to "{topic.name}".</>
                                    }
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        })}
                        {/* Total */}
                        <td className={cn("text-center px-2 py-1.5 font-mono text-[10px] font-medium",
                          topic.isGap ? "text-red-400/50" : topic.total >= 3 ? "text-emerald-400/70" : "text-amber-400/70",
                        )}>
                          {topic.total}
                        </td>
                        {/* Status */}
                        <td className="text-center px-2 py-1.5">
                          <span className={cn(
                            "text-[9px] px-2 py-0.5 rounded-[10px] font-medium",
                            status === "covered" && "bg-emerald-500/12 text-emerald-400",
                            status === "partial" && "bg-amber-500/12 text-amber-400",
                            status === "missing" && "bg-red-500/12 text-red-400",
                          )}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer totals */}
                <tfoot>
                  <tr className="border-t border-border/50 bg-muted/30">
                    <td className="px-3 py-1.5 font-semibold text-muted-foreground/50">Total</td>
                    {sources.map(src => {
                      const total = flatTopics
                        .filter(t => !t.isParent)
                        .reduce((sum, t) => sum + (t.perSource.get(src.id) ?? 0), 0);
                      return (
                        <td key={src.id} className="text-center px-2 py-1.5 font-mono font-bold text-muted-foreground/60">
                          {total}
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-1.5 font-mono font-bold text-foreground/70">
                      {flatTopics.filter(t => !t.isParent).reduce((sum, t) => sum + t.total, 0)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            </TooltipProvider>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground/40">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500/50" /> 3+ parts</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500/50" /> 1-2 parts</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500/30" /> Gap</span>
            </div>
          </div>
        )}

        {/* ── Documents Table ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60">
              Documents
            </h3>
          </div>
          <TooltipProvider delayDuration={200}>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground/60">Document</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground/60">Parts</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground/60">Chars</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground/60">Topics</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground/60" style={{ width: 140 }}>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(src => {
                  const chars = src.parts.reduce((sum, p) => sum + (p.content?.length ?? 0), 0);
                  const coverage = computeTopicCoverage(src, hierarchy);
                  const covPct = sourceCoveragePercent.get(src.id) ?? 0;
                  return (
                    <tr
                      key={src.id}
                      className="border-t border-border/20 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => onSelectSource(src.id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                          <div>
                            <div className="font-medium text-foreground/80 hover:underline">{src.description || src.name}</div>
                            <div className="text-[10px] text-muted-foreground/30 mt-0.5">
                              {[
                                src.metadata?.pageCount && `${src.metadata.pageCount} pages`,
                                src.metadata?.fileSize && `${(Number(src.metadata.fileSize) / (1024 * 1024)).toFixed(1)} MB`,
                              ].filter(Boolean).join(" · ") || src.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground/60">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{src.parts.length}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p className="text-[11px]">{src.parts.length} extracted parts (chunks) from this document</p></TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground/60">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{formatChars(chars)}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p className="text-[11px]">{chars.toLocaleString()} total characters across all parts</p></TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground/60">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{coverage.length} / {totalTopics}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p className="text-[11px]">{coverage.length} out of {totalTopics} topics have at least one part linked from this document</p></TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-end gap-2 cursor-help">
                              <div className="w-14 h-1 bg-muted/50 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", covPct >= 60 ? "bg-emerald-500" : "bg-amber-500")}
                                  style={{ width: `${covPct}%` }}
                                />
                              </div>
                              <span className={cn("font-mono text-[10px] font-medium w-8 text-right",
                                covPct >= 60 ? "text-emerald-400" : "text-amber-400",
                              )}>
                                {covPct}%
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px]">
                            <p className="text-[11px]">
                              {covPct}% topic coverage — {coverage.length} of {totalTopics} topics have linked parts from this document.
                              {covPct < 60 ? " Consider adding more source material to improve coverage." : " Good coverage."}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

/** Flat topic row for the hierarchical coverage matrix */
interface FlatTopicRow {
  id: string;
  name: string;
  depth: number;
  isParent: boolean;
  parentId?: string;
  perSource: Map<string, number>;
  total: number;
  isGap: boolean;
}

// ─── Single Document View ───

/** Group parts by extractionPath (I2) */
interface PartGroup {
  readonly path: string;
  readonly parts: KnowledgeSourcePart[];
}

function groupPartsByExtractionPath(parts: readonly KnowledgeSourcePart[]): PartGroup[] {
  const groups = new Map<string, KnowledgeSourcePart[]>();
  for (const part of parts) {
    const key = part.extractionPath || "Ungrouped";
    const existing = groups.get(key);
    if (existing) {
      existing.push(part);
    } else {
      groups.set(key, [part]);
    }
  }
  return Array.from(groups.entries()).map(([path, groupParts]) => ({
    path,
    parts: groupParts,
  }));
}

/** Compute topic coverage bars for a source (I1) */
function computeTopicCoverage(
  source: KnowledgeSource,
  hierarchy?: TopicHierarchyNode[],
): { topicName: string; partCount: number; totalParts: number }[] {
  if (!hierarchy) return [];

  // Build a set of all part IDs for fast lookup (matching CoverageMatrix hasLink logic)
  const partIdSet = new Set(source.parts.map(p => p.id));
  const partIdWithSource = new Set(source.parts.map(p => `${source.id}/${p.id}`));

  const topicCoverage = new Map<string, number>();

  const walkTopics = (nodes: TopicHierarchyNode[]) => {
    for (const node of nodes) {
      const refs = node.sourceChunkRefs ?? [];
      let matchCount = 0;
      for (const ref of refs) {
        if (partIdSet.has(ref) || partIdWithSource.has(ref)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        topicCoverage.set(node.name, matchCount);
      }
      if (node.children) walkTopics(node.children);
    }
  };
  walkTopics(hierarchy);

  return Array.from(topicCoverage.entries())
    .map(([topicName, partCount]) => ({
      topicName,
      partCount,
      totalParts: source.parts.length,
    }))
    .sort((a, b) => b.partCount - a.partCount);
}

/** Find topics linked to a specific part (I5) */
function findTopicsForPart(
  part: KnowledgeSourcePart,
  hierarchy?: TopicHierarchyNode[],
): string[] {
  if (!hierarchy) return [];
  const topics: string[] = [];
  // Match all possible ref formats: raw partId, sourceId/partId, sourceId:partId
  const possibleRefs = new Set([
    part.id,
    `${part.sourceId}/${part.id}`,
    `${part.sourceId}:${part.id}`,
  ]);

  const walk = (nodes: TopicHierarchyNode[]) => {
    for (const node of nodes) {
      const refs = node.sourceChunkRefs ?? [];
      if (refs.some(ref => possibleRefs.has(ref))) {
        topics.push(node.name);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(hierarchy);
  return topics;
}

function SingleDocView({ source, focusPartId }: { readonly source: KnowledgeSource; readonly focusPartId?: string | null }) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(focusPartId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const outlineRef = useRef<HTMLDivElement>(null);
  const { dataset, records } = DatasetDetailConsumer();

  // Scroll to focused part in the outline when navigated from record table
  useEffect(() => {
    if (!focusPartId || !outlineRef.current) return;
    setSelectedPartId(focusPartId);
    const timer = setTimeout(() => {
      const el = outlineRef.current?.querySelector(`[data-part-id="${focusPartId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [focusPartId]);
  const hierarchy = dataset?.topicHierarchy?.hierarchy;

  const selectedPart = selectedPartId
    ? source.parts.find(p => p.id === selectedPartId)
    : source.parts[0] ?? null;

  const currentIndex = selectedPart
    ? source.parts.findIndex(p => p.id === selectedPart.id)
    : 0;

  const navigatePart = useCallback((direction: -1 | 1) => {
    const nextIdx = currentIndex + direction;
    if (nextIdx >= 0 && nextIdx < source.parts.length) {
      setSelectedPartId(source.parts[nextIdx].id);
    }
  }, [currentIndex, source.parts]);

  const totalChars = useMemo(
    () => source.parts.reduce((sum, p) => sum + (p.content?.length ?? 0), 0),
    [source.parts],
  );

  // Topic coverage (for header chips)
  const topicCoverage = useMemo(
    () => computeTopicCoverage(source, hierarchy),
    [source, hierarchy],
  );

  // Per-part topic names for TOC chips
  const partTopicNames = useMemo(() => {
    if (!hierarchy) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const part of source.parts) {
      const topics = findTopicsForPart(part, hierarchy);
      if (topics.length > 0) map.set(part.id, topics);
    }
    return map;
  }, [source.parts, hierarchy]);

  // Group parts by extractionPath
  const partGroups = useMemo(
    () => groupPartsByExtractionPath(source.parts),
    [source.parts],
  );
  const hasMultipleGroups = partGroups.length > 1 || (partGroups.length === 1 && partGroups[0].path !== "Ungrouped");

  // Filter parts by search query
  const queryLower = searchQuery.toLowerCase().trim();
  const matchesPart = useCallback((part: KnowledgeSourcePart) => {
    if (!queryLower) return true;
    const title = (part.title || "").toLowerCase();
    const content = (part.content || "").toLowerCase();
    const topics = partTopicNames.get(part.id) ?? [];
    return title.includes(queryLower) || content.includes(queryLower) || topics.some(t => t.toLowerCase().includes(queryLower));
  }, [queryLower, partTopicNames]);

  // Topics linked to selected part + records count
  const linkedTopics = useMemo(
    () => selectedPart ? findTopicsForPart(selectedPart, hierarchy) : [],
    [selectedPart, hierarchy],
  );

  const linkedRecordsStats = useMemo(() => {
    if (linkedTopics.length === 0) return { count: 0, avgScore: undefined as number | undefined, records: [] as DatasetRecord[] };
    const topicSet = new Set(linkedTopics);
    const matched = records.filter(r => r.topic && topicSet.has(r.topic));
    const scores = matched.map(r => r.evaluation?.score ?? r.evaluation?.evalScore).filter((s): s is number => s != null);
    return {
      count: matched.length,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined,
      records: matched,
    };
  }, [linkedTopics, records]);

  /** Get a 2-line preview snippet from the part content */
  const getPreview = (part: KnowledgeSourcePart): string => {
    const text = (part.content || "").replace(/\n+/g, " ").trim();
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  };

  const formatChars = (chars: number) =>
    chars >= 1000 ? `${(chars / 1000).toFixed(1)}K` : `${chars}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 grid grid-cols-2 overflow-hidden">
        {/* Left: Compact header + search + TOC with previews */}
        <div className="border-r border-border/50 flex flex-col overflow-hidden">
          {/* Compact doc header with topic chips */}
          <div className="shrink-0 px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-semibold text-foreground truncate">
                  {source.description || source.name}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/50">
                  <span>{source.parts.length} parts</span>
                  <span>{formatChars(totalChars)} chars</span>
                </div>
              </div>
              <a
                href={knowledgeSourceService.getFileUrl(source.workflowId, source.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-colors shrink-0"
                title="View original PDF"
              >
                <Eye className="w-3 h-3" />
                View PDF
              </a>
            </div>
            {topicCoverage.length > 0 && (
              <TopicCoverageChips topics={topicCoverage} />
            )}
          </div>

          {/* Search bar */}
          <div className="shrink-0 px-3 py-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search parts..."
                className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-background border border-border/50 rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[rgb(var(--theme-500))]"
              />
            </div>
          </div>

          {/* TOC list with previews + topic chips */}
          <div className="flex-1 overflow-y-auto" ref={outlineRef}>
            {hasMultipleGroups ? (
              partGroups.map(group => {
                const visibleParts = group.parts.filter(matchesPart);
                if (visibleParts.length === 0) return null;
                return (
                  <div key={group.path}>
                    <div className="px-4 py-1.5 mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/25">
                      {group.path.replace(/^\["|"\]$/g, "").replace(/^"|"$/g, "")}
                    </div>
                    {visibleParts.map((part) => {
                      const globalIdx = source.parts.indexOf(part);
                      const topics = partTopicNames.get(part.id);
                      return (
                        <TocItem
                          key={part.id}
                          part={part}
                          index={globalIdx}
                          isSelected={selectedPart?.id === part.id}
                          onSelect={setSelectedPartId}
                          preview={getPreview(part)}
                          topics={topics}
                          formatChars={formatChars}
                        />
                      );
                    })}
                  </div>
                );
              })
            ) : (
              source.parts.filter(matchesPart).map((part, idx) => {
                const topics = partTopicNames.get(part.id);
                return (
                  <TocItem
                    key={part.id}
                    part={part}
                    index={idx}
                    isSelected={selectedPart?.id === part.id}
                    onSelect={setSelectedPartId}
                    preview={getPreview(part)}
                    topics={topics}
                    formatChars={formatChars}
                  />
                );
              })
            )}
            {queryLower && source.parts.filter(matchesPart).length === 0 && (
              <div className="px-4 py-8 text-center text-[11px] text-muted-foreground/40">
                No parts match "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Right: Reader panel */}
        <div className="overflow-y-auto bg-muted/20 flex flex-col">
          {selectedPart ? (
            <PartViewer
              part={selectedPart}
              sourceName={source.name}
              currentIndex={currentIndex}
              totalParts={source.parts.length}
              onNavigate={navigatePart}
              linkedTopics={linkedTopics}
              linkedRecordsCount={linkedRecordsStats.count}
              linkedAvgScore={linkedRecordsStats.avgScore}
              linkedRecords={linkedRecordsStats.records}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-xs">
              Select a part to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TOC Item (Option D style) ───

function TocItem({
  part,
  index,
  isSelected,
  onSelect,
  preview,
  topics,
  formatChars,
}: {
  readonly part: KnowledgeSourcePart;
  readonly index: number;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly preview: string;
  readonly topics?: string[];
  readonly formatChars: (c: number) => string;
}) {
  return (
    <button
      type="button"
      data-part-id={part.id}
      onClick={() => onSelect(part.id)}
      className={cn(
        "w-full text-left px-4 py-2 transition-colors border-l-2",
        isSelected
          ? "border-l-[rgb(var(--theme-500))] bg-[rgba(var(--theme-500),0.05)]"
          : "border-l-transparent hover:bg-muted/20",
      )}
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-muted-foreground/30 w-5 shrink-0 font-medium tabular-nums text-right">{index + 1}</span>
        <span className={cn("flex-1 text-[11px] font-medium truncate", isSelected ? "text-[rgb(var(--theme-500))]" : "text-foreground/80")}>
          {part.title || `Part ${index + 1}`}
        </span>
        {part.type === "table" && (
          <span className="text-[8px] px-1 py-px rounded bg-amber-500/10 text-amber-400 font-semibold uppercase tracking-wider shrink-0">table</span>
        )}
        {part.type === "image" && (
          <span className="text-[8px] px-1 py-px rounded bg-purple-500/10 text-purple-400 font-semibold uppercase tracking-wider shrink-0">image</span>
        )}
        <span className="text-[9px] text-muted-foreground/25 shrink-0 tabular-nums">{formatChars(part.content?.length ?? 0)}</span>
      </div>
      {/* Preview snippet */}
      <p className="text-[10px] text-muted-foreground/40 leading-snug mt-1 pl-7 line-clamp-2">
        {preview}
      </p>
      {/* Topic chips */}
      {topics && topics.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 pl-7">
          {topics.map(t => (
            <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-[10px] bg-[rgba(var(--theme-500),0.1)] text-[9px] font-medium text-[rgb(var(--theme-500))]">
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}


// ─── Topic Coverage Chips ───

function TopicCoverageChips({ topics }: { readonly topics: Array<{ topicName: string; partCount: number; totalParts: number }> }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-1 mt-2">
        {topics.map(({ topicName, partCount, totalParts }) => {
          const pct = totalParts > 0 ? Math.round((partCount / totalParts) * 100) : 0;
          return (
            <Tooltip key={topicName}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
                      detail: { jobId: topicName, type: "topic" },
                    }));
                  }}
                  className="inline-flex items-center px-2 py-0.5 rounded-[10px] bg-[rgba(var(--theme-500),0.1)] text-[9px] font-medium text-[rgb(var(--theme-500))] hover:bg-[rgba(var(--theme-500),0.2)] transition-colors cursor-pointer"
                >
                  {topicName}
                  <span className="ml-1 opacity-50">({partCount})</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                <p className="text-[11px]">
                  <span className="font-semibold">{topicName}</span> — {partCount} of {totalParts} parts
                  in this document are linked to this topic ({pct}% coverage).
                  Click to navigate to the topic.
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}



// ─── Part Viewer ───

/**
 * For table-typed parts without a markdown header row, synthesize one
 * so ReactMarkdown + remarkGfm renders a proper <table>.
 */
function preparePartContent(part: KnowledgeSourcePart): string {
  const content = part.content || "No content available";
  if (part.type !== "table") return content;

  const lines = content.split("\n").filter(Boolean);
  // Already has a header + separator → valid GFM table
  const hasSeparator = lines.some(line => /^\s*\|?\s*[-:]+[-|:\s]*$/.test(line));
  if (hasSeparator) return content;

  // Pipe-separated rows without header — detect column count from most common pattern
  const pipedLines = lines.filter(line => line.includes("|"));
  if (pipedLines.length === 0) return content;

  // Count columns: split by `|`, trim leading/trailing empties (from `| ... |` format)
  const colCounts = pipedLines.map(line => {
    const cells = line.split("|");
    // Remove first and last if empty (standard `| cell | cell |` format)
    if (cells.length > 0 && !cells[0].trim()) cells.shift();
    if (cells.length > 0 && !cells[cells.length - 1].trim()) cells.pop();
    return cells.length;
  });
  // Use the most common column count
  const countFreq = new Map<number, number>();
  for (const c of colCounts) countFreq.set(c, (countFreq.get(c) ?? 0) + 1);
  const colCount = [...countFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  if (colCount < 2) return content;

  // Build generic header: Col 1 | Col 2 | Col 3 ...
  const headerCells = Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`);
  const header = `| ${headerCells.join(" | ")} |`;
  const separator = `| ${headerCells.map(() => "---").join(" | ")} |`;

  // Find where table rows start (skip non-table preamble lines)
  const tableStartIdx = lines.findIndex(line => line.trim().startsWith("|"));
  const preamble = lines.slice(0, tableStartIdx).join("\n");
  const tableRows = lines.slice(tableStartIdx).join("\n");

  return [preamble, header, separator, tableRows].filter(Boolean).join("\n");
}

function PartViewer({
  part,
  sourceName,
  currentIndex,
  totalParts,
  onNavigate,
  linkedTopics,
  linkedRecordsCount,
  linkedAvgScore,
  linkedRecords = [],
}: {
  readonly part: KnowledgeSourcePart;
  readonly sourceName: string;
  readonly currentIndex: number;
  readonly totalParts: number;
  readonly onNavigate: (direction: -1 | 1) => void;
  readonly linkedTopics: string[];
  readonly linkedRecordsCount: number;
  readonly linkedAvgScore?: number;
  readonly linkedRecords?: readonly DatasetRecord[];
}) {
  const typeBadge = part.type === "table" ? "TABLE" : part.type === "image" ? "IMAGE" : "TEXT";
  const typeBadgeColor = part.type === "table"
    ? "bg-amber-500/20 text-amber-400"
    : part.type === "image"
      ? "bg-purple-500/20 text-purple-400"
      : "bg-green-500/20 text-green-400";

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalParts - 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header — title row + meta row (matches mockup part-viewer-header) */}
      <div className="px-5 py-4 border-b border-border/50">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-foreground flex-1 min-w-0 truncate">
            {part.title || "Untitled Part"}
          </h3>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0",
            typeBadgeColor,
          )}>
            {typeBadge}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <span className="text-[11px] text-muted-foreground/50 tabular-nums">
              {currentIndex + 1} of {totalParts}
            </span>
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => onNavigate(-1)}
              className={cn(
                "w-[22px] h-[22px] rounded-[5px] border border-border bg-muted/30 flex items-center justify-center transition-colors",
                hasPrev ? "hover:bg-muted text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
              )}
              title="Previous part"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => onNavigate(1)}
              className={cn(
                "w-[22px] h-[22px] rounded-[5px] border border-border bg-muted/30 flex items-center justify-center transition-colors",
                hasNext ? "hover:bg-muted text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
              )}
              title="Next part"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Meta row — tag-style elements */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <FileText className="w-[11px] h-[11px] text-muted-foreground/40" /> {sourceName}
          </span>
          {part.extractionPath && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Tags className="w-[11px] h-[11px] text-muted-foreground/40" /> {part.extractionPath}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/60">
            {(part.content?.length ?? 0).toLocaleString()} chars
          </span>
        </div>
      </div>

      {/* Content area — rendered markdown (matches mockup part-viewer-content) */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="prose prose-invert prose-sm max-w-none text-[13px] text-foreground/80 leading-[1.7]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{preparePartContent(part)}</ReactMarkdown>
        </div>
      </div>

      {/* I5: Footer — single row: topics + records count */}
      {(linkedTopics.length > 0 || linkedRecordsCount > 0) && (
        <div className="border-t border-border/50 bg-muted/30 px-5 py-2.5 shrink-0 flex items-center gap-3 flex-wrap">
          {linkedTopics.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 shrink-0">Topics</span>
              {linkedTopics.map(topic => (
                <button
                  key={topic}
                  type="button"
                  className="inline-flex items-center px-2 py-0.5 rounded-[10px] bg-[rgba(var(--theme-500),0.1)] text-[10px] font-medium text-[rgb(var(--theme-500))] hover:bg-[rgba(var(--theme-500),0.2)] hover:underline transition-colors cursor-pointer"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
                      detail: { jobId: topic, type: "topic" },
                    }));
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          )}
          {linkedTopics.length > 0 && linkedRecordsCount > 0 && (
            <span className="text-muted-foreground/20">·</span>
          )}
          {linkedRecordsCount > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[10px] text-muted-foreground shrink-0 hover:text-foreground transition-colors cursor-pointer">
                    <span className="font-semibold text-[rgb(var(--theme-500))]">{linkedRecordsCount}</span> records
                    {linkedAvgScore != null && (
                      <> · avg <span className="font-semibold text-foreground">{linkedAvgScore.toFixed(2)}</span></>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-[400px] p-0">
                  <RecordsTooltipContent records={linkedRecords} avgScore={linkedAvgScore} />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Back To Record Banner ───

function BackToRecordBanner({ onClick }: { readonly onClick: () => void }) {
  return (
    <div className="px-4 py-2 bg-[rgba(var(--theme-500),0.08)] border-b border-[rgba(var(--theme-500),0.2)] flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--theme-500))] hover:text-foreground transition-colors font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to record
      </button>
    </div>
  );
}

// ─── Records Tooltip ───

/** Extract first user message as a short preview */
function getRecordPreview(record: DatasetRecord): string {
  const data = record.data as { input?: { messages?: Array<{ role?: string; content?: string }> }; messages?: Array<{ role?: string; content?: string }> } | undefined;
  const messages = data?.input?.messages ?? data?.messages ?? [];
  const userMsg = messages.find(m => m.role === "user");
  const text = userMsg?.content ?? "";
  return text.length > 80 ? text.slice(0, 80) + "…" : text;
}

function RecordsTooltipContent({
  records,
  avgScore,
}: {
  readonly records: readonly DatasetRecord[];
  readonly avgScore?: number;
}) {
  const displayed = records.slice(0, 8);
  const remaining = records.length - displayed.length;

  return (
    <div className="py-1.5">
      {avgScore != null && (
        <div className="px-3 py-1.5 border-b border-border/50 text-[10px] text-muted-foreground">
          Avg eval score: <span className="font-semibold text-foreground">{avgScore.toFixed(3)}</span>
          <span className="ml-1">across {records.length} record{records.length !== 1 ? "s" : ""}</span>
        </div>
      )}
      <div className="max-h-[240px] overflow-y-auto">
        {displayed.map((record) => {
          const score = record.evaluation?.evalScore;
          return (
            <button
              key={record.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
              onClick={() => {
                const topic = record.topic;
                if (topic) {
                  window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
                    detail: { jobId: topic, type: "topic" },
                  }));
                }
              }}
            >
              <span className="flex-1 text-[10px] text-foreground/80 truncate min-w-0">
                {getRecordPreview(record) || record.id}
              </span>
              {score != null && (
                <span className={cn(
                  "text-[10px] font-mono tabular-nums shrink-0",
                  score >= 0.8 ? "text-emerald-400" : score >= 0.6 ? "text-amber-400" : "text-red-400",
                )}>
                  {score.toFixed(2)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {remaining > 0 && (
        <div className="px-3 py-1 text-[9px] text-muted-foreground/50 border-t border-border/50">
          +{remaining} more
        </div>
      )}
    </div>
  );
}

// ─── Empty State ───

function SourcesEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
      <FileText className="w-10 h-10 mb-3 opacity-40" />
      <h3 className="text-sm font-medium text-foreground mb-1">No Sources</h3>
      <p className="text-xs text-center max-w-xs">
        Upload documents to extract knowledge parts for topic coverage analysis.
      </p>
    </div>
  );
}
