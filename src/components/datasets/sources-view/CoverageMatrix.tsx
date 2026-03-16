/**
 * CoverageMatrix
 *
 * Grid showing topics (rows) × documents (columns) for the "All Sources" view.
 * Cells indicate how many parts from a source are linked to a topic.
 * Matches mockup: card container, colored dots, part counts, gap highlights.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import type { TopicHierarchyNode } from "@/types/dataset-types";
import type { KnowledgeSource } from "@/types/knowledge-types";

interface CoverageMatrixProps {
  /** Called when a source column header is clicked */
  readonly onSelectSource: (sourceId: string) => void;
}

/** Flatten topic hierarchy into leaf topics with their full path */
function collectLeafTopics(
  nodes: TopicHierarchyNode[],
  parentPath: string[] = [],
): { name: string; path: string[]; sourceChunkRefs: readonly string[] }[] {
  const leaves: { name: string; path: string[]; sourceChunkRefs: readonly string[] }[] = [];
  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];
    if (node.children && node.children.length > 0) {
      leaves.push(...collectLeafTopics(node.children, currentPath));
    } else {
      leaves.push({
        name: node.name,
        path: currentPath,
        sourceChunkRefs: node.sourceChunkRefs ?? [],
      });
    }
  }
  return leaves;
}

/** Count how many parts from this source appear in the topic's refs */
function countLinks(source: KnowledgeSource, refs: readonly string[]): number {
  if (refs.length === 0) return 0;
  const refSet = new Set(refs);
  let count = 0;
  for (const p of source.parts) {
    if (refSet.has(p.id) || refSet.has(`${source.id}/${p.id}`)) count++;
  }
  return count;
}

/** Color dot based on linked part count */
function getCoverageColor(count: number, totalSources: number): string {
  if (count === 0) return "text-muted-foreground/30";
  const ratio = count / Math.max(totalSources, 1);
  if (ratio >= 0.6) return "text-emerald-500";
  if (ratio >= 0.3) return "text-amber-500";
  return "text-red-500";
}

export function CoverageMatrix({ onSelectSource }: CoverageMatrixProps) {
  const { sources } = KnowledgeSourcesConsumer();
  const { dataset } = DatasetDetailConsumer();

  const hierarchy = dataset?.topicHierarchy?.hierarchy;

  const leafTopics = useMemo(() => {
    if (!hierarchy) return [];
    return collectLeafTopics(hierarchy);
  }, [hierarchy]);

  // Build matrix data: for each topic × source, count linked parts
  const matrix = useMemo(() => {
    return leafTopics.map(topic => ({
      topic,
      cells: sources.map(source => countLinks(source, topic.sourceChunkRefs)),
      totalLinks: sources.reduce((sum, source) => sum + countLinks(source, topic.sourceChunkRefs), 0),
    }));
  }, [leafTopics, sources]);

  if (leafTopics.length === 0 || sources.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/50 text-center py-8">
        Coverage matrix requires both topics and documents.
      </div>
    );
  }

  const colCount = sources.length;

  return (
    <div className="p-3.5 bg-card border border-border rounded-xl">
      {/* Title */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[rgb(var(--theme-500))]">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Topic × Source Coverage
        </span>
      </div>

      {/* Grid */}
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `120px repeat(${colCount}, 1fr)` }}
      >
        {/* Header row */}
        <div className="text-left text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-1.5 py-1">
          Topic
        </div>
        {sources.map(source => (
          <button
            key={source.id}
            type="button"
            onClick={() => onSelectSource(source.id)}
            className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-1.5 py-1 text-center truncate hover:text-foreground transition-colors"
            title={source.name}
          >
            {source.name.length > 14 ? `${source.name.slice(0, 14)}…` : source.name}
          </button>
        ))}

        {/* Data rows */}
        {matrix.map(({ topic, cells, totalLinks }) => (
          <CoverageRow
            key={topic.name}
            topicName={topic.name}
            cells={cells}
            totalLinks={totalLinks}
            totalSources={sources.length}
          />
        ))}
      </div>
    </div>
  );
}

function CoverageRow({
  topicName,
  cells,
  totalLinks,
  totalSources,
}: {
  readonly topicName: string;
  readonly cells: number[];
  readonly totalLinks: number;
  readonly totalSources: number;
}) {
  const dotColor = getCoverageColor(totalLinks, totalSources);

  return (
    <>
      {/* Topic label with colored dot */}
      <div className="flex items-center gap-1 text-[10px] text-foreground/70 px-1.5 py-[3px] truncate">
        <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", dotColor === "text-muted-foreground/30" ? "bg-muted-foreground/30" : "")}
          style={dotColor !== "text-muted-foreground/30" ? { background: dotColor.includes("emerald") ? "rgb(16,185,129)" : dotColor.includes("amber") ? "rgb(245,158,11)" : "rgb(239,68,68)" } : undefined}
        />
        <span className="truncate">{topicName}</span>
      </div>

      {/* Cells */}
      {cells.map((count, idx) => (
        <div
          key={idx}
          className={cn(
            "h-[22px] rounded flex items-center justify-center text-[9px] font-semibold",
            count > 0
              ? "bg-emerald-500/15 text-emerald-400"
              : totalLinks > 0
                ? "bg-muted/50 text-muted-foreground/40"
                : "bg-red-500/10 text-red-400 border border-dashed border-red-500/30",
          )}
        >
          {count > 0 ? count : totalLinks > 0 ? "—" : "gap"}
        </div>
      ))}
    </>
  );
}
