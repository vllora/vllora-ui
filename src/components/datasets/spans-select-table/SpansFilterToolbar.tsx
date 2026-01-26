/**
 * SpansFilterToolbar
 *
 * Toolbar component for filtering and sorting spans.
 * Includes search, provider filter, time range filter, labels filter, and sort controls.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowUpDown, X } from "lucide-react";
import { LabelFilter } from "@/components/label-filter/LabelFilter";
import type { LabelInfo } from "@/services/labels-api";

// Operation names to include (LLM provider spans)
export const PROVIDER_OPTIONS = [
  { value: "all", label: "All Providers" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "bedrock", label: "Bedrock" },
];

// Time range options (relative time in microseconds)
const HOUR_US = 60 * 60 * 1000 * 1000;
const DAY_US = 24 * HOUR_US;

export const TIME_RANGE_OPTIONS = [
  { value: "all", label: "All Time", microseconds: 0 },
  { value: "15m", label: "Last 15 Minutes", microseconds: 15 * 60 * 1000 * 1000 },
  { value: "30m", label: "Last 30 Minutes", microseconds: 30 * 60 * 1000 * 1000 },
  { value: "1h", label: "Last Hour", microseconds: HOUR_US },
  { value: "3h", label: "Last 3 Hours", microseconds: 3 * HOUR_US },
  { value: "6h", label: "Last 6 Hours", microseconds: 6 * HOUR_US },
  { value: "12h", label: "Last 12 Hours", microseconds: 12 * HOUR_US },
  { value: "24h", label: "Last 24 Hours", microseconds: DAY_US },
  { value: "3d", label: "Last 3 Days", microseconds: 3 * DAY_US },
  { value: "7d", label: "Last 7 Days", microseconds: 7 * DAY_US },
  { value: "14d", label: "Last 2 Weeks", microseconds: 14 * DAY_US },
  { value: "30d", label: "Last 30 Days", microseconds: 30 * DAY_US },
  { value: "90d", label: "Last 3 Months", microseconds: 90 * DAY_US },
];

export const ALL_PROVIDERS = ["openai", "gemini", "anthropic", "bedrock"];

export interface SpansFilterToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedProvider: string;
  onProviderChange: (provider: string) => void;
  selectedTimeRange: string;
  onTimeRangeChange: (timeRange: string) => void;
  selectedLabels: string[];
  onLabelsChange: (labels: string[]) => void;
  availableLabels: LabelInfo[];
  isLabelsLoading?: boolean;
  sortDirection: "asc" | "desc";
  onSortDirectionChange: (direction: "asc" | "desc") => void;
}

export function SpansFilterToolbar({
  searchQuery,
  onSearchQueryChange,
  selectedProvider,
  onProviderChange,
  selectedTimeRange,
  onTimeRangeChange,
  selectedLabels,
  onLabelsChange,
  availableLabels,
  isLabelsLoading = false,
  sortDirection,
  onSortDirectionChange,
}: SpansFilterToolbarProps) {
  const hasActiveFilters = selectedProvider !== "all" || selectedTimeRange !== "all" || selectedLabels.length > 0;

  const clearFilters = () => {
    onProviderChange("all");
    onTimeRangeChange("all");
    onLabelsChange([]);
  };

  return (
    <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by operation or thread ID..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Provider Filter */}
      <Select value={selectedProvider} onValueChange={onProviderChange}>
        <SelectTrigger className="w-[150px] focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Time Range Filter */}
      <Select value={selectedTimeRange} onValueChange={onTimeRangeChange}>
        <SelectTrigger className="w-[160px] focus:ring-0 focus:ring-offset-0">
          <SelectValue placeholder="Time Range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Labels Filter */}
      <div className="w-[160px]">
        <LabelFilter
          selectedLabels={selectedLabels}
          onLabelsChange={onLabelsChange}
          availableLabels={availableLabels}
          isLoading={isLabelsLoading}
          placeholder="Labels"
          showCounts={false}
          maxVisibleLabels={100}
          size="sm"
          className="!space-y-0 [&>div:nth-child(2)]:hidden"
        />
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          Clear filters
        </Button>
      )}

      {/* Sort Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSortDirectionChange(sortDirection === "desc" ? "asc" : "desc")}
        className="gap-2 ml-auto"
      >
        <ArrowUpDown className="h-4 w-4" />
        {sortDirection === "desc" ? "Newest first" : "Oldest first"}
      </Button>
    </div>
  );
}
