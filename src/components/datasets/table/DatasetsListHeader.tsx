/**
 * DatasetsListHeader
 *
 * Header for the datasets grid view with search bar, segmented filter tabs, and sort.
 * "New Workflow" button opens a dropdown: setup guide (default) or API trace capture.
 */

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search, Plus, Terminal, RefreshCw } from "lucide-react";
import { DATASET_FILTER_CONFIG } from "@/types/dataset-types";
import type { DatasetFilterGroup } from "@/types/dataset-types";
import { DatasetSortDropdown } from "./DatasetSortDropdown";
import type { DatasetSort } from "./DatasetSortDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router";

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
  const navigate = useNavigate();

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

      {/* Count + New Workflow dropdown */}
      <div className="flex items-center gap-3 ml-auto">
        {totalCount !== undefined && (
          <span className="text-xs text-muted-foreground/50 tabular-nums">
            {totalCount} workflow{totalCount !== 1 ? "s" : ""}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[rgb(var(--theme-500))] text-white hover:bg-[rgb(var(--theme-600))] transition-colors shrink-0">
              <Plus className="w-3.5 h-3.5" />
              New Workflow
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => navigate("/finetune/setup")} className="gap-2.5 cursor-pointer">
              <Terminal className="w-4 h-4 text-[rgb(var(--theme-500))]" />
              <div>
                <div className="text-sm font-medium">Run finetune skill</div>
                <div className="text-[11px] text-muted-foreground">Setup guide for Claude Code / Codex</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="gap-2.5 opacity-40">
              <RefreshCw className="w-4 h-4 text-orange-400" />
              <div>
                <div className="text-sm font-medium">Route existing API calls</div>
                <div className="text-[11px] text-muted-foreground">Coming soon</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
