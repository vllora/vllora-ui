/**
 * CoverageMatrix
 *
 * Grid showing topics (rows) × documents (columns) for the "All Sources" view.
 * Shows depth-2 topics (children of roots) with aggregated coverage from descendants.
 * Matches mockup: compact parent-level rows, colored dots, part counts, gap highlights.
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

/** Collect all sourceChunkRefs from a node and all its descendants */
function collectAllRefs(node: TopicHierarchyNode): string[] {
  const refs: string[] = [...(node.sourceChunkRefs ?? [])];
  if (node.children) {
    for (const child of node.children) {
      refs.push(...collectAllRefs(child));
    }
  }
  return refs;
}

/**
 * Collect display topics for the matrix.
 * For deep hierarchies (3+ levels): show depth-2 nodes (children of roots),
 *   aggregating all descendant refs.
 * For shallow hierarchies (1-2 levels): show leaf nodes directly.
 */
function collectDisplayTopics(
  hierarchy: TopicHierarchyNode[],
): { name: string; allRefs: readonly string[] }[] {
  const maxDepth = calcDepth(hierarchy);

  if (maxDepth <= 2) {
    // Shallow: show leaves directly
    const leaves: { name: string; allRefs: readonly string[] }[] = [];
    const collectLeaves = (nodes: TopicHierarchyNode[]) => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          collectLeaves(node.children);
        } else {
          leaves.push({ name: node.name, allRefs: node.sourceChunkRefs ?? [] });
        }
      }
    };
    collectLeaves(hierarchy);
    return leaves;
  }

  // Deep hierarchy: show depth-2 nodes with aggregated refs
  const topics: { name: string; allRefs: readonly string[] }[] = [];
  for (const root of hierarchy) {
    if (root.children && root.children.length > 0) {
      for (const child of root.children) {
        topics.push({
          name: child.name,
          allRefs: collectAllRefs(child),
        });
      }
    } else {
      // Root with no children — show as-is
      topics.push({ name: root.name, allRefs: root.sourceChunkRefs ?? [] });
    }
  }
  return topics;
}

function calcDepth(nodes: TopicHierarchyNode[], depth = 1): number {
  let max = depth;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      max = Math.max(max, calcDepth(node.children, depth + 1));
    }
  }
  return max;
}

/** Count how many parts from this source appear in the refs */
function countLinks(source: KnowledgeSource, refs: readonly string[]): number {
  if (refs.length === 0) return 0;
  const refSet = new Set(refs);
  let count = 0;
  for (const p of source.parts) {
    if (refSet.has(p.id) || refSet.has(`${source.id}/${p.id}`)) count++;
  }
  return count;
}

/** Dot color based on total linked parts across all sources */
function getDotColor(totalLinks: number): "emerald" | "amber" | "red" | "muted" {
  if (totalLinks === 0) return "muted";
  if (totalLinks >= 3) return "emerald";
  if (totalLinks >= 2) return "amber";
  return "red";
}

const DOT_STYLES: Record<ReturnType<typeof getDotColor>, string> = {
  emerald: "rgb(16,185,129)",
  amber: "rgb(245,158,11)",
  red: "rgb(239,68,68)",
  muted: "",
};

export function CoverageMatrix({ onSelectSource }: CoverageMatrixProps) {
  const { sources } = KnowledgeSourcesConsumer();
  const { dataset } = DatasetDetailConsumer();
  const hierarchy = dataset?.topicHierarchy?.hierarchy;

  const displayTopics = useMemo(() => {
    if (!hierarchy) return [];
    return collectDisplayTopics(hierarchy);
  }, [hierarchy]);

  const matrix = useMemo(() => {
    return displayTopics.map(topic => {
      const cells = sources.map(source => countLinks(source, topic.allRefs));
      const totalLinks = cells.reduce((sum, c) => sum + c, 0);
      return { topic, cells, totalLinks };
    });
  }, [displayTopics, sources]);

  if (displayTopics.length === 0 || sources.length === 0) {
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
        style={{ gridTemplateColumns: `140px repeat(${colCount}, 1fr)` }}
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
            {source.name.length > 16 ? `${source.name.slice(0, 16)}…` : source.name}
          </button>
        ))}

        {/* Data rows */}
        {matrix.map(({ topic, cells, totalLinks }) => (
          <CoverageRow
            key={topic.name}
            topicName={topic.name}
            cells={cells}
            totalLinks={totalLinks}
            sources={sources}
            onSelectSource={onSelectSource}
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
  sources,
  onSelectSource,
}: {
  readonly topicName: string;
  readonly cells: number[];
  readonly totalLinks: number;
  readonly sources: readonly KnowledgeSource[];
  readonly onSelectSource: (sourceId: string) => void;
}) {
  const color = getDotColor(totalLinks);

  return (
    <>
      {/* Topic label with colored dot */}
      <div className="flex items-center gap-1.5 text-[10px] text-foreground/70 px-1.5 py-[3px] truncate">
        <span
          className={cn(
            "w-[5px] h-[5px] rounded-full shrink-0",
            color === "muted" && "bg-muted-foreground/30",
          )}
          style={color !== "muted" ? { background: DOT_STYLES[color] } : undefined}
        />
        <span className="truncate">{topicName}</span>
      </div>

      {/* Cells */}
      {cells.map((count, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelectSource(sources[idx].id)}
          title={`${sources[idx].name}: ${count} linked part${count !== 1 ? "s" : ""}`}
          className={cn(
            "h-[22px] rounded flex items-center justify-center text-[9px] font-semibold transition-all cursor-pointer",
            "hover:ring-1 hover:ring-foreground/20",
            count > 0
              ? "bg-emerald-500/15 text-emerald-400"
              : totalLinks > 0
                ? "bg-muted/50 text-muted-foreground/40"
                : "bg-red-500/10 text-red-400 border border-dashed border-red-500/30",
          )}
        >
          {count > 0 ? count : totalLinks > 0 ? "—" : "gap"}
        </button>
      ))}
    </>
  );
}
