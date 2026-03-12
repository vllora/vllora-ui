/**
 * DatasetsListHeader
 *
 * Header for the datasets grid view with search bar, segmented filter tabs, and sort.
 */

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { DATASET_FILTER_CONFIG } from "@/types/dataset-types";
import type { DatasetFilterGroup } from "@/types/dataset-types";
import { DatasetSortDropdown } from "./DatasetSortDropdown";
import type { DatasetSort } from "./DatasetSortDropdown";

export type DatasetFilter = "all" | DatasetFilterGroup;
export type { DatasetSort };

interface DatasetsListHeaderProps {
  searchQuery: string;
  activeFilter: DatasetFilter;
  activeSort: DatasetSort;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: DatasetFilter) => void;
  onSortChange: (sort: DatasetSort) => void;
  totalCount?: number;
}

// Build filters from shared config, with "All" prepended
const FILTERS: { value: DatasetFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...DATASET_FILTER_CONFIG.map((config) => ({
    value: config.value as DatasetFilter,
    label: config.label,
  })),
];

export function DatasetsListHeader({
  searchQuery,
  activeFilter,
  activeSort,
  onSearchChange,
  onFilterChange,
  onSortChange,
  totalCount,
}: DatasetsListHeaderProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search workflows..."
          className="pl-9 bg-transparent border-border/50 focus-visible:ring-1 focus-visible:ring-[rgb(var(--theme-500))]"
        />
      </div>

      {/* Segmented filter tabs */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/30">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              activeFilter === filter.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Sort dropdown */}
      <DatasetSortDropdown activeSort={activeSort} onSortChange={onSortChange} />

      {/* Count + New Workflow button */}
      <div className="flex items-center gap-3 ml-auto">
        {totalCount !== undefined && (
          <span className="text-xs text-muted-foreground/50 tabular-nums">
            {totalCount} workflow{totalCount !== 1 ? "s" : ""}
          </span>
        )}
        <Link
          to="/finetune/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[rgb(var(--theme-500))] text-white hover:bg-[rgb(var(--theme-600))] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New Workflow
        </Link>
      </div>
    </div>
  );
}
