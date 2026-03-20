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
import { FileText, Tags, ChevronRight, ChevronLeft, FolderOpen, ArrowLeft, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { CoverageMatrix } from "./CoverageMatrix";
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
  const { dataset, records } = DatasetDetailConsumer();
  const hierarchy = dataset?.topicHierarchy?.hierarchy;
  const [selectedPartState, setSelectedPartState] = useState<{ source: KnowledgeSource; part: KnowledgeSourcePart } | null>(() => {
    const firstSource = sources[0];
    const firstPart = firstSource?.parts[0];
    return firstSource && firstPart ? { source: firstSource, part: firstPart } : null;
  });

  // Find all parts across all sources for part viewer navigation
  const allParts = useMemo(() => {
    const result: { source: KnowledgeSource; part: KnowledgeSourcePart }[] = [];
    for (const src of sources) {
      for (const p of src.parts) {
        result.push({ source: src, part: p });
      }
    }
    return result;
  }, [sources]);

  const currentIndex = selectedPartState
    ? allParts.findIndex(item => item.part.id === selectedPartState.part.id)
    : -1;

  const navigatePart = useCallback((direction: -1 | 1) => {
    const nextIdx = currentIndex + direction;
    if (nextIdx >= 0 && nextIdx < allParts.length) {
      setSelectedPartState(allParts[nextIdx]);
    }
  }, [currentIndex, allParts]);

  const handleSelectPart = useCallback((source: KnowledgeSource, part: KnowledgeSourcePart) => {
    setSelectedPartState({ source, part });
  }, []);

  // Linked topics + record count for selected part
  const linkedTopics = useMemo(
    () => selectedPartState ? findTopicsForPart(selectedPartState.part, hierarchy) : [],
    [selectedPartState, hierarchy],
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

  return (
    <div className="flex-1 grid grid-cols-2 overflow-hidden h-full">
      {/* Left: Coverage matrix + doc cards */}
      <div className="border-r border-border/50 overflow-y-auto p-4 space-y-4">
        {/* Stats summary */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{sources.length} document{sources.length !== 1 ? "s" : ""}</span>
          <span className="text-border">|</span>
          <span>{totalParts} part{totalParts !== 1 ? "s" : ""} extracted</span>
        </div>

        {/* Coverage matrix — topics × documents */}
        <CoverageMatrix onSelectSource={onSelectSource} />

        {/* Rich doc cards matching mockup */}
        {sources.map(source => (
          <DocCard
            key={source.id}
            source={source}
            onClick={() => onSelectSource(source.id)}
            onSelectPart={(part) => handleSelectPart(source as KnowledgeSource, part)}
            selectedPartId={selectedPartState?.part.id}
          />
        ))}
      </div>

      {/* Right: Part viewer */}
      <div className="overflow-y-auto bg-muted/20 flex flex-col">
        {selectedPartState ? (
          <PartViewer
            part={selectedPartState.part}
            sourceName={selectedPartState.source.name}
            currentIndex={currentIndex}
            totalParts={allParts.length}
            onNavigate={navigatePart}
            linkedTopics={linkedTopics}
            linkedRecordsCount={linkedRecordsStats.count}
            linkedAvgScore={linkedRecordsStats.avgScore}
            linkedRecords={linkedRecordsStats.records}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-xs">
            Click a part from any document to preview
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Doc Card (matches mockup: header + inline parts + linked topics) ───

function DocCard({
  source,
  onClick,
  onSelectPart,
  selectedPartId,
}: {
  readonly source: KnowledgeSource;
  readonly onClick: () => void;
  readonly onSelectPart?: (part: KnowledgeSourcePart) => void;
  readonly selectedPartId?: string;
}) {
  const { dataset } = DatasetDetailConsumer();
  const hierarchy = dataset?.topicHierarchy?.hierarchy;

  const totalChars = useMemo(
    () => source.parts.reduce((sum, p) => sum + (p.content?.length ?? 0), 0),
    [source.parts],
  );

  const topicCoverage = useMemo(
    () => computeTopicCoverage(source, hierarchy),
    [source, hierarchy],
  );

  const partGroups = useMemo(
    () => groupPartsByExtractionPath(source.parts),
    [source.parts],
  );
  const hasMultipleGroups = partGroups.length > 1 || (partGroups.length === 1 && partGroups[0].path !== "Ungrouped");

  // Topic link counts per part
  const partTopicCounts = useMemo(() => {
    if (!hierarchy) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const part of source.parts) {
      const topics = findTopicsForPart(part, hierarchy);
      if (topics.length > 0) counts.set(part.id, topics.length);
    }
    return counts;
  }, [source.parts, hierarchy]);

  // Linked topic names for footer
  const linkedTopicNames = useMemo(
    () => topicCoverage.map(tc => tc.topicName),
    [topicCoverage],
  );

  const MAX_CHIPS = 6;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-muted-foreground/40 transition-all cursor-pointer"
    >
      {/* Header: icon + title/meta + stats */}
      <div className="flex items-start gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold text-foreground truncate">{source.name}</h4>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {source.metadata?.pageCount ? `${source.metadata.pageCount} pages · ` : ""}
            {source.metadata?.fileSize ? `${(Number(source.metadata.fileSize) / (1024 * 1024)).toFixed(1)} MB · ` : ""}
            Extracted via Docling
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <div className="text-center">
            <span className="block text-sm font-bold text-foreground">{source.parts.length}</span>
            <span className="text-[10px] text-muted-foreground/60">parts</span>
          </div>
          <div className="text-center">
            <span className="block text-sm font-bold text-foreground">{topicCoverage.length}</span>
            <span className="text-[10px] text-muted-foreground/60">topics</span>
          </div>
          <div className="text-center">
            <span className="block text-sm font-bold text-foreground">{totalChars >= 1000 ? `${(totalChars / 1000).toFixed(0)}K` : totalChars}</span>
            <span className="text-[10px] text-muted-foreground/60">chars</span>
          </div>
        </div>
      </div>

      {/* Inline parts outline */}
      <div className="mb-2">
        {hasMultipleGroups ? (
          partGroups.map(group => (
            <div key={group.path}>
              <div className="flex items-center gap-1 py-1">
                <FolderOpen className="w-2.5 h-2.5 text-muted-foreground/50" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.path}
                </span>
              </div>
              {group.parts.map(part => (
                <DocCardPartItem key={part.id} part={part} linkCount={partTopicCounts.get(part.id) ?? 0} isSelected={selectedPartId === part.id} onSelect={onSelectPart ? () => onSelectPart(part) : undefined} />
              ))}
            </div>
          ))
        ) : (
          source.parts.map(part => (
            <DocCardPartItem key={part.id} part={part} linkCount={partTopicCounts.get(part.id) ?? 0} isSelected={selectedPartId === part.id} onSelect={onSelectPart ? () => onSelectPart(part) : undefined} />
          ))
        )}
      </div>

      {/* Linked topics footer */}
      <div className="pt-2.5 border-t border-border/50 flex flex-wrap items-center gap-1">
        {linkedTopicNames.length > 0 ? (
          <>
            <span className="text-[10px] text-muted-foreground/50 mr-1">Linked to:</span>
            {linkedTopicNames.slice(0, MAX_CHIPS).map(name => (
              <span key={name} className="px-1.5 py-0.5 rounded-full bg-[rgba(var(--theme-500),0.1)] text-[10px] text-[rgb(var(--theme-500))]">
                {name}
              </span>
            ))}
            {linkedTopicNames.length > MAX_CHIPS && (
              <span className="px-1.5 py-0.5 rounded-full bg-muted/50 text-[10px] text-muted-foreground/60">
                +{linkedTopicNames.length - MAX_CHIPS}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-[10px] text-muted-foreground/50 mr-1">Not linked to any topic</span>
            <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-[10px] text-red-400">unlinked</span>
          </>
        )}
      </div>
    </button>
  );
}

/** Small badge showing how many topics link to a part */
function TopicLinkBadge({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <span className={cn(
      "shrink-0 px-1.5 py-px rounded-full text-[9px] font-medium tabular-nums",
      count >= 3
        ? "bg-emerald-500/15 text-emerald-400"
        : count >= 2
          ? "bg-[rgba(var(--theme-500),0.12)] text-[rgb(var(--theme-500))]"
          : "bg-muted/60 text-muted-foreground/60",
    )}>
      {count} {count === 1 ? "topic" : "topics"}
    </span>
  );
}

/** Part item inside a doc card (compact, non-interactive) */
function DocCardPartItem({
  part,
  linkCount,
  isSelected,
  onSelect,
}: {
  readonly part: KnowledgeSourcePart;
  readonly linkCount: number;
  readonly isSelected?: boolean;
  readonly onSelect?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 px-2 rounded-md transition-colors",
        onSelect && "cursor-pointer hover:bg-muted/50",
        isSelected && "bg-[rgba(var(--theme-500),0.08)]",
      )}
      onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
      role={onSelect ? "button" : undefined}
    >
      <PartTypeIcon type={part.type} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="block text-[11px] font-medium text-foreground truncate">
          {part.title || "Untitled"}
        </span>
        <span className="text-[9px] text-muted-foreground/50">
          {(part.content?.length ?? 0) >= 1000
            ? `${((part.content?.length ?? 0) / 1000).toFixed(1)}K chars`
            : `${part.content?.length ?? 0} chars`}
          {part.extractionPath && ` · ${part.extractionPath}`}
        </span>
      </div>
      <TopicLinkBadge count={linkCount} />
    </div>
  );
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

// ─── Part Type Icon ───

function PartTypeIcon({ type, className }: { readonly type: string; readonly className?: string }) {
  const label = type === "table" ? "▦" : type === "image" ? "◻" : "T";
  const colors = type === "table"
    ? "bg-amber-500/15 text-amber-400"
    : type === "image"
      ? "bg-purple-500/15 text-purple-400"
      : "bg-emerald-500/15 text-emerald-400";
  return (
    <span className={cn(
      "w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] font-semibold",
      colors,
      className,
    )}>
      {label}
    </span>
  );
}

// ─── Part Viewer ───

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
          <ReactMarkdown>{part.content || "No content available"}</ReactMarkdown>
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
