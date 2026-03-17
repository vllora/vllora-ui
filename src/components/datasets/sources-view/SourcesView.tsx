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

import { useState, useMemo, useCallback } from "react";
import { FileText, Tags, ChevronRight, ChevronLeft, FolderOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { CoverageMatrix } from "./CoverageMatrix";
import type { KnowledgeSource, KnowledgeSourcePart } from "@/types/knowledge-types";
import type { TopicHierarchyNode } from "@/types/dataset-types";

interface SourcesViewProps {
  /** Currently selected source ID (null = all sources view) */
  readonly selectedSourceId?: string | null;
  /** Called when user selects a source from AllSourcesView cards/matrix */
  readonly onSelectSource?: (sourceId: string) => void;
}

export function SourcesView({ selectedSourceId, onSelectSource }: SourcesViewProps) {
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
    <div className="flex-1 overflow-hidden">
      {activeSource ? (
        <SingleDocView source={activeSource} />
      ) : (
        <AllSourcesView sources={sources} totalParts={totalParts} onSelectSource={handleSelectSource} />
      )}
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
    if (linkedTopics.length === 0) return { count: 0, avgScore: undefined as number | undefined };
    const topicSet = new Set(linkedTopics);
    const matched = records.filter(r => r.topic && topicSet.has(r.topic));
    const scores = matched.map(r => r.evaluation?.score ?? r.evaluation?.evalScore).filter((s): s is number => s != null);
    return {
      count: matched.length,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined,
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

function SingleDocView({ source }: { readonly source: KnowledgeSource }) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const { dataset, records } = DatasetDetailConsumer();
  const hierarchy = dataset?.topicHierarchy?.hierarchy;

  const selectedPart = selectedPartId
    ? source.parts.find(p => p.id === selectedPartId)
    : source.parts[0] ?? null;

  // Flat index for prev/next navigation (I3)
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

  // I1: Topic coverage bars
  const topicCoverage = useMemo(
    () => computeTopicCoverage(source, hierarchy),
    [source, hierarchy],
  );

  // I2: Group parts by extractionPath
  const partGroups = useMemo(
    () => groupPartsByExtractionPath(source.parts),
    [source.parts],
  );
  const hasMultipleGroups = partGroups.length > 1 || (partGroups.length === 1 && partGroups[0].path !== "Ungrouped");

  // Topic link counts per part (for dots in outline)
  const partTopicCounts = useMemo(() => {
    if (!hierarchy) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const part of source.parts) {
      const topics = findTopicsForPart(part, hierarchy);
      if (topics.length > 0) {
        counts.set(part.id, topics.length);
      }
    }
    return counts;
  }, [source.parts, hierarchy]);

  // I5: Topics linked to selected part + records count
  const linkedTopics = useMemo(
    () => selectedPart ? findTopicsForPart(selectedPart, hierarchy) : [],
    [selectedPart, hierarchy],
  );

  const linkedRecordsStats = useMemo(() => {
    if (linkedTopics.length === 0) return { count: 0, avgScore: undefined as number | undefined };
    const topicSet = new Set(linkedTopics);
    const matched = records.filter(r => r.topic && topicSet.has(r.topic));
    const scores = matched.map(r => r.evaluation?.score ?? r.evaluation?.evalScore).filter((s): s is number => s != null);
    return {
      count: matched.length,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined,
    };
  }, [linkedTopics, records]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 50/50 grid layout matching mockup */}
      <div className="flex-1 grid grid-cols-2 overflow-hidden">
        {/* Left: Document info + topic coverage + parts outline */}
        <div className="border-r border-border/50 overflow-y-auto p-4 space-y-4">
          {/* Doc header card — icon + name/description left, stat columns right */}
          <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
            <div className="w-11 h-11 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-bold text-foreground truncate">{source.name}</h3>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                {source.description || (
                  [source.metadata?.pageCount && `${source.metadata.pageCount} pages`,
                   source.metadata?.fileSize && `${(Number(source.metadata.fileSize) / (1024 * 1024)).toFixed(1)} MB`]
                    .filter(Boolean).join(" · ") || "Knowledge source"
                )}
              </p>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-center">
                <div className="text-[15px] font-bold text-foreground tabular-nums">{source.parts.length}</div>
                <div className="text-[10px] text-muted-foreground/50">parts</div>
              </div>
              <div className="text-center">
                <div className="text-[15px] font-bold text-foreground tabular-nums">{topicCoverage.length}</div>
                <div className="text-[10px] text-muted-foreground/50">topics</div>
              </div>
              <div className="text-center">
                <div className="text-[15px] font-bold text-foreground tabular-nums">
                  {totalChars >= 1000 ? `${(totalChars / 1000).toFixed(1)}K` : totalChars}
                </div>
                <div className="text-[10px] text-muted-foreground/50">chars</div>
              </div>
            </div>
          </div>

          {/* I1: Topic coverage bars */}
          {topicCoverage.length > 0 && (
            <div className="p-3 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-1.5 mb-2">
                <Tags className="w-3 h-3 text-[rgb(var(--theme-500))]" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Topics covered by this document
                </span>
              </div>
              <div className="space-y-1">
                {topicCoverage.map(({ topicName, partCount, totalParts: total }) => {
                  const pct = Math.round((partCount / total) * 100);
                  return (
                    <div key={topicName} className="flex items-center gap-2 py-1">
                      <span className="text-[11px] text-foreground/80 w-[120px] truncate shrink-0">{topicName}</span>
                      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-500"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 w-[50px] text-right shrink-0">
                        {partCount} part{partCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Parts list header */}
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-[rgb(var(--theme-500))]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Extracted Parts ({source.parts.length})
            </span>
          </div>

          {/* Parts outline — I2: grouped by extractionPath */}
          <div className="overflow-hidden">
            {hasMultipleGroups ? (
              partGroups.map(group => (
                <div key={group.path}>
                  <div className="px-3 py-1.5 bg-muted/30 border-b border-border/30 flex items-center gap-1.5">
                    <FolderOpen className="w-2.5 h-2.5 text-muted-foreground/50" />
                    <span className="text-[10px] font-medium text-muted-foreground/70 truncate">
                      {group.path}
                    </span>
                  </div>
                  {group.parts.map((part, idx) => (
                    <PartOutlineItem
                      key={part.id}
                      part={part}
                      index={source.parts.indexOf(part)}
                      fallbackIndex={idx}
                      isSelected={selectedPart?.id === part.id}
                      onSelect={setSelectedPartId}
                      linkedTopicCount={partTopicCounts.get(part.id) ?? 0}
                    />
                  ))}
                </div>
              ))
            ) : (
              source.parts.map((part, idx) => (
                <PartOutlineItem
                  key={part.id}
                  part={part}
                  index={idx}
                  fallbackIndex={idx}
                  isSelected={selectedPart?.id === part.id}
                  onSelect={setSelectedPartId}
                  linkedTopicCount={partTopicCounts.get(part.id) ?? 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Part viewer */}
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

// ─── Part Outline Item ───

function PartOutlineItem({
  part,
  index,
  fallbackIndex,
  isSelected,
  onSelect,
  linkedTopicCount = 0,
}: {
  readonly part: KnowledgeSourcePart;
  readonly index: number;
  readonly fallbackIndex: number;
  readonly isSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly linkedTopicCount?: number;
}) {
  const displayIndex = index >= 0 ? index : fallbackIndex;

  return (
    <button
      type="button"
      onClick={() => onSelect(part.id)}
      className={cn(
        "w-full text-left py-[5px] px-2 flex items-center gap-2 rounded-md transition-colors",
        isSelected
          ? "bg-[rgba(var(--theme-500),0.08)] text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <PartTypeIcon type={part.type} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="block truncate text-[11px] font-medium text-foreground">
          {part.title || `Part ${displayIndex + 1}`}
        </span>
        <span className="text-[9px] text-muted-foreground/50 mt-px">
          {(part.content?.length ?? 0) >= 1000
            ? `${((part.content?.length ?? 0) / 1000).toFixed(1)}K chars`
            : `${part.content?.length ?? 0} chars`}
          {part.extractionPath && ` · ${part.extractionPath}`}
        </span>
      </div>
      <TopicLinkBadge count={linkedTopicCount} />
    </button>
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
}: {
  readonly part: KnowledgeSourcePart;
  readonly sourceName: string;
  readonly currentIndex: number;
  readonly totalParts: number;
  readonly onNavigate: (direction: -1 | 1) => void;
  readonly linkedTopics: string[];
  readonly linkedRecordsCount: number;
  readonly linkedAvgScore?: number;
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

      {/* I5: Footer — separate sections for topics + records (matches mockup) */}
      {(linkedTopics.length > 0 || linkedRecordsCount > 0) && (
        <div className="border-t border-border/50 bg-muted/30 px-5 py-3 shrink-0 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 items-baseline">
          {linkedTopics.length > 0 && (
            <>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Referenced by Topics</div>
              <div className="flex items-center gap-1 flex-wrap">
                {linkedTopics.map(topic => (
                  <span
                    key={topic}
                    className="inline-flex items-center px-2 py-0.5 rounded-[10px] bg-[rgba(var(--theme-500),0.1)] text-[10px] font-medium text-[rgb(var(--theme-500))]"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </>
          )}
          {linkedRecordsCount > 0 && (
            <>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Records Generated</div>
              <span className="text-[10px] text-muted-foreground">
                <span className="font-semibold text-[rgb(var(--theme-500))]">{linkedRecordsCount}</span> records from this part
                {linkedAvgScore != null && (
                  <> · avg score <span className="font-semibold text-foreground">{linkedAvgScore.toFixed(2)}</span></>
                )}
              </span>
            </>
          )}
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
