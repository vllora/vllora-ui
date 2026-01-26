/**
 * DatasetsListHeader
 *
 * Header for the datasets grid view with search bar and filter tabs.
 */

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { DATASET_STATE_CONFIG } from "@/types/dataset-types";
import type { DatasetState } from "@/types/dataset-types";

export type DatasetFilter = "all" | DatasetState;

interface DatasetsListHeaderProps {
  searchQuery: string;
  activeFilter: DatasetFilter;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: DatasetFilter) => void;
}

// Build filters from shared config, with "All" prepended
const FILTERS: { value: DatasetFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...DATASET_STATE_CONFIG.map((config) => ({
    value: config.value as DatasetFilter,
    label: config.label,
  })),
];

export function DatasetsListHeader({
  searchQuery,
  activeFilter,
  onSearchChange,
  onFilterChange,
}: DatasetsListHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 border border-border rounded-lg bg-card px-4 py-3">
      {/* Search input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search datasets by name or ID..."
          className="pl-9 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
              activeFilter === filter.value
                ? "bg-[rgb(var(--theme-500))] text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
