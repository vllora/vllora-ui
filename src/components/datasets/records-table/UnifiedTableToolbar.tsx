/**
 * UnifiedTableToolbar
 *
 * Search + filter toolbar for the unified single-table layout.
 * Provides text search, topic filter, score filter, and record count.
 */

import { Search } from "lucide-react";
import type { TopicHierarchyNode } from "@/types/dataset-types";

export interface UnifiedTableToolbarProps {
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly topicFilter: string;
  readonly onTopicFilterChange: (topic: string) => void;
  readonly scoreFilter: string;
  readonly onScoreFilterChange: (filter: string) => void;
  readonly totalRecords: number;
  readonly filteredRecords: number;
  readonly hierarchy?: TopicHierarchyNode[];
}

/** Collect all topic names from hierarchy (flat list) */
function collectTopicNames(nodes: TopicHierarchyNode[]): string[] {
  const names: string[] = [];
  for (const node of nodes) {
    names.push(node.name);
    if (node.children) {
      names.push(...collectTopicNames(node.children));
    }
  }
  return names;
}

export function UnifiedTableToolbar({
  searchQuery,
  onSearchChange,
  topicFilter,
  onTopicFilterChange,
  scoreFilter,
  onScoreFilterChange,
  totalRecords,
  filteredRecords,
  hierarchy,
}: UnifiedTableToolbarProps) {
  const topicNames = hierarchy ? collectTopicNames(hierarchy) : [];
  const isFiltered = filteredRecords !== totalRecords;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-muted/20">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
        <input
          type="text"
          placeholder="Search records..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border/50 rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[rgb(var(--theme-500))]"
        />
      </div>

      {/* Topic filter */}
      {topicNames.length > 0 && (
        <select
          value={topicFilter}
          onChange={(e) => onTopicFilterChange(e.target.value)}
          className="text-xs bg-background border border-border/50 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-[rgb(var(--theme-500))]"
        >
          <option value="all">All Topics</option>
          {topicNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}

      {/* Score filter */}
      <select
        value={scoreFilter}
        onChange={(e) => onScoreFilterChange(e.target.value)}
        className="text-xs bg-background border border-border/50 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-[rgb(var(--theme-500))]"
      >
        <option value="all">All Scores</option>
        <option value="high">0.8+</option>
        <option value="mid">0.6–0.8</option>
        <option value="low">&lt;0.6</option>
      </select>

      {/* Record count */}
      <span className="text-xs text-muted-foreground/60 ml-auto tabular-nums shrink-0">
        {isFiltered ? `${filteredRecords} / ` : ""}{totalRecords} records
      </span>
    </div>
  );
}
