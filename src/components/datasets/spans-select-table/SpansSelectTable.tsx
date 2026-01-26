/**
 * SpansSelectTable
 *
 * A reusable component for selecting spans from the gateway.
 * Includes search, sort, pagination, and virtual scrolling.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listSpans, type PaginatedSpansResponse, type ListSpansQuery } from "@/services/spans-api";
import { listLabels, type LabelInfo } from "@/services/labels-api";
import type { Span } from "@/types/common-type";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { SpansFilterToolbar, TIME_RANGE_OPTIONS, ALL_PROVIDERS } from "./SpansFilterToolbar";
import { SpansTable } from "./SpansTable";

const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [100, 200, 300, 500, 1000];

export interface SpansSelectTableProps {
  projectId: string | null;
  selectedSpanIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  /** Callback when spans are loaded, provides the full spans array */
  onSpansLoaded?: (spans: Span[]) => void;
  /** Callback when "select all matching" state changes */
  onAllMatchingSelectedChange?: (isAllMatchingSelected: boolean, totalCount: number) => void;
}

export function SpansSelectTable({
  projectId,
  selectedSpanIds,
  onSelectionChange,
  onSpansLoaded,
  onAllMatchingSelectedChange,
}: SpansSelectTableProps) {
  // Spans data
  const [spans, setSpans] = useState<Span[]>([]);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState({ total: 0, offset: 0, limit: DEFAULT_PAGE_SIZE });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and sort
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("all");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  // Labels
  const [availableLabels, setAvailableLabels] = useState<LabelInfo[]>([]);
  const [isLabelsLoading, setIsLabelsLoading] = useState(false);

  // Track "select all matching" mode (all spans across all pages)
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);

  // Track unfiltered total count for empty state display
  const [unfilteredTotalCount, setUnfilteredTotalCount] = useState<number | undefined>(undefined);

  // Determine if any filters are active
  const hasActiveFilters = selectedProvider !== "all" || selectedTimeRange !== "all" || selectedLabels.length > 0 || debouncedSearch.trim() !== "";

  // Clear all filters
  const clearFilters = () => {
    setSelectedProvider("all");
    setSelectedTimeRange("all");
    setSelectedLabels([]);
    setSearchQuery("");
  };

  // Build filter params from current filter state
  const buildFilterParams = useCallback((offset: number): ListSpansQuery => {
    const params: ListSpansQuery = {
      limit: pageSize,
      offset,
    };

    // Provider filter
    if (selectedProvider === "all") {
      params.operationNames = ALL_PROVIDERS.join(",");
    } else {
      params.operationNames = selectedProvider;
    }

    // Time range filter
    const timeOption = TIME_RANGE_OPTIONS.find((t) => t.value === selectedTimeRange);
    if (timeOption && timeOption.microseconds > 0) {
      params.startTime = Date.now() * 1000 - timeOption.microseconds;
    }

    // Labels filter
    if (selectedLabels.length > 0) {
      params.labels = selectedLabels.join(",");
    }

    // Search filter (uses debounced value)
    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    }

    return params;
  }, [selectedProvider, selectedTimeRange, selectedLabels, debouncedSearch, pageSize]);

  // Fetch spans
  const fetchSpans = useCallback(
    async (offset = 0) => {
      if (!projectId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response: PaginatedSpansResponse = await listSpans({
          projectId,
          params: buildFilterParams(offset),
        });

        setSpans(response.data);
        setPagination(response.pagination);
        onSpansLoaded?.(response.data);

        // Track unfiltered total on initial load (when no filters are active)
        if (!hasActiveFilters && unfilteredTotalCount === undefined) {
          setUnfilteredTotalCount(response.pagination.total);
        }
      } catch (err) {
        console.error("Failed to fetch spans:", err);
        setError("Failed to load spans. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, onSpansLoaded, buildFilterParams, hasActiveFilters, unfilteredTotalCount]
  );

  // Fetch available labels
  const fetchLabels = useCallback(async () => {
    if (!projectId) return;

    setIsLabelsLoading(true);
    try {
      const response = await listLabels({ projectId });
      setAvailableLabels(response.labels);
    } catch (err) {
      console.error("Failed to fetch labels:", err);
    } finally {
      setIsLabelsLoading(false);
    }
  }, [projectId]);

  // Load spans on mount and when filters change
  useEffect(() => {
    fetchSpans(0);
    // Reset "select all matching" when filters change
    setIsAllMatchingSelected(false);
  }, [fetchSpans]);

  // Load labels on mount
  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  // Sort spans (search filtering is now done server-side)
  const filteredSpans = useMemo(() => {
    const result = [...spans];

    result.sort((a, b) => {
      const timeA = a.start_time_us;
      const timeB = b.start_time_us;
      return sortDirection === "desc" ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [spans, sortDirection]);

  // Selection handlers
  const toggleSpanSelection = (spanId: string) => {
    const next = new Set(selectedSpanIds);
    if (next.has(spanId)) {
      next.delete(spanId);
      // If user manually deselects, they're no longer selecting "all matching"
      if (isAllMatchingSelected) {
        setIsAllMatchingSelected(false);
        onAllMatchingSelectedChange?.(false, pagination.total);
      }
    } else {
      next.add(spanId);
    }
    onSelectionChange(next);
  };

  const toggleSelectAll = () => {
    if (selectedSpanIds.size === filteredSpans.length) {
      onSelectionChange(new Set());
      setIsAllMatchingSelected(false);
      onAllMatchingSelectedChange?.(false, pagination.total);
    } else {
      onSelectionChange(new Set(filteredSpans.map((s) => s.span_id)));
    }
  };

  const selectAllMatching = () => {
    // Mark that all matching spans are selected (even those not loaded)
    setIsAllMatchingSelected(true);
    onAllMatchingSelectedChange?.(true, pagination.total);
    // Select all currently loaded spans
    onSelectionChange(new Set(filteredSpans.map((s) => s.span_id)));
  };

  const clearSelection = () => {
    onSelectionChange(new Set());
    setIsAllMatchingSelected(false);
    onAllMatchingSelectedChange?.(false, pagination.total);
  };

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Helper to convert spans to JSONL content
  const spansToJsonl = (spansToExport: Span[]): string => {
    return spansToExport
      .map((span) => {
        const dataInfo = extractDataInfoFromSpan(span);
        const inputMessages = (dataInfo.input?.messages as unknown[]) || [];
        const outputMessage = dataInfo.output?.messages;
        const messages = outputMessage
          ? [...inputMessages, outputMessage]
          : inputMessages;
        const tools = (dataInfo.input?.tools as unknown[]) || [];

        return JSON.stringify({ messages, tools });
      })
      .join("\n");
  };

  // Export selected spans as JSONL
  const handleExport = async () => {
    if (isExporting) return;

    try {
      let spansToExport: Span[];

      if (isAllMatchingSelected) {
        // Fetch ALL matching spans from the server
        setIsExporting(true);
        toast.info("Fetching all matching spans...");

        const allSpans: Span[] = [];
        let offset = 0;
        const batchSize = 500; // Fetch in larger batches for efficiency

        while (offset < pagination.total) {
          const params = buildFilterParams(offset);
          params.limit = batchSize;

          const response = await listSpans({
            projectId: projectId!,
            params,
          });

          allSpans.push(...response.data);
          offset += batchSize;
        }

        spansToExport = allSpans;
      } else {
        // Export only selected spans from current page
        spansToExport = filteredSpans.filter((s) => selectedSpanIds.has(s.span_id));
      }

      if (spansToExport.length === 0) {
        toast.error("No spans selected");
        return;
      }

      const jsonlContent = spansToJsonl(spansToExport);

      const blob = new Blob([jsonlContent], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spans-export-${new Date().toISOString().split("T")[0]}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${spansToExport.length} record${spansToExport.length !== 1 ? "s" : ""} as JSONL`);
    } catch (err) {
      console.error("Failed to export spans:", err);
      toast.error("Failed to export spans");
    } finally {
      setIsExporting(false);
    }
  };

  // Pagination handlers
  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      fetchSpans(Math.max(0, pagination.offset - pageSize));
    }
  };

  const handleNextPage = () => {
    if (pagination.offset + pageSize < pagination.total) {
      fetchSpans(pagination.offset + pageSize);
    }
  };

  const handlePageSizeChange = (newSize: string) => {
    const size = parseInt(newSize, 10);
    setPageSize(size);
    // Reset to first page when page size changes
    fetchSpans(0);
  };

  const currentPage = Math.floor(pagination.offset / pageSize) + 1;
  const totalPages = Math.ceil(pagination.total / pageSize);

  // Format timestamp
  const formatTime = (microseconds: number) => {
    const date = new Date(microseconds / 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 max-w-full overflow-hidden">
      {/* Toolbar */}
      <SpansFilterToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedProvider={selectedProvider}
        onProviderChange={setSelectedProvider}
        selectedTimeRange={selectedTimeRange}
        onTimeRangeChange={setSelectedTimeRange}
        selectedLabels={selectedLabels}
        onLabelsChange={setSelectedLabels}
        availableLabels={availableLabels}
        isLabelsLoading={isLabelsLoading}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
        selectedCount={isAllMatchingSelected ? pagination.total : selectedSpanIds.size}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {/* Spans list */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SpansTable
          isLoading={isLoading}
          error={error}
          searchQuery={searchQuery}
          filteredSpans={filteredSpans}
          selectedSpanIds={selectedSpanIds}
          totalCount={pagination.total}
          unfilteredTotalCount={unfilteredTotalCount}
          isAllMatchingSelected={isAllMatchingSelected}
          hasActiveFilters={hasActiveFilters}
          onRetry={() => fetchSpans(0)}
          onToggleSelectAll={toggleSelectAll}
          onSelectAllMatching={selectAllMatching}
          onClearSelection={clearSelection}
          onToggleSpanSelection={toggleSpanSelection}
          onClearFilters={clearFilters}
          formatTime={formatTime}
        />
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4 flex-shrink-0">
          <p className="text-sm text-muted-foreground">
            Showing {pagination.offset + 1}-
            {Math.min(pagination.offset + pageSize, pagination.total)} of{" "}
            {pagination.total}
          </p>
          <div className="flex items-center gap-4">
            {/* Page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={isLoading || pagination.offset === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={isLoading || pagination.offset + pageSize >= pagination.total}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Per page:</span>
              <Select value={pageSize.toString()} onValueChange={handlePageSizeChange} disabled={isLoading}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get selected spans from the table's internal state
 */
export function useSpansSelection() {
  const [selectedSpanIds, setSelectedSpanIds] = useState<Set<string>>(new Set());
  const [spans, setSpans] = useState<Span[]>([]);

  const getSelectedSpans = useCallback(() => {
    return spans.filter((s) => selectedSpanIds.has(s.span_id));
  }, [spans, selectedSpanIds]);

  return {
    selectedSpanIds,
    setSelectedSpanIds,
    spans,
    setSpans,
    getSelectedSpans,
  };
}
