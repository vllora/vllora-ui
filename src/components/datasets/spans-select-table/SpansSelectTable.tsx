/**
 * SpansSelectTable
 *
 * A reusable component for selecting spans from the gateway.
 * Includes search, sort, pagination, and virtual scrolling.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listSpans, type PaginatedSpansResponse, type ListSpansQuery } from "@/services/spans-api";
import type { Span } from "@/types/common-type";
import { formatDistanceToNow } from "date-fns";
import { SpansFilterToolbar, TIME_RANGE_OPTIONS, ALL_PROVIDERS } from "./SpansFilterToolbar";
import { SpansList } from "./SpansList";

const PAGE_SIZE = 100;

export interface SpansSelectTableProps {
  projectId: string | null;
  selectedSpanIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  /** Callback when spans are loaded, provides the full spans array */
  onSpansLoaded?: (spans: Span[]) => void;
}

export function SpansSelectTable({
  projectId,
  selectedSpanIds,
  onSelectionChange,
  onSpansLoaded,
}: SpansSelectTableProps) {
  // Spans data
  const [spans, setSpans] = useState<Span[]>([]);
  const [pagination, setPagination] = useState({ total: 0, offset: 0, limit: PAGE_SIZE });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and sort
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("all");

  // Build filter params from current filter state
  const buildFilterParams = useCallback((offset: number): ListSpansQuery => {
    const params: ListSpansQuery = {
      limit: PAGE_SIZE,
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

    return params;
  }, [selectedProvider, selectedTimeRange]);

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
      } catch (err) {
        console.error("Failed to fetch spans:", err);
        setError("Failed to load spans. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, onSpansLoaded, buildFilterParams]
  );

  // Load spans on mount and when filters change
  useEffect(() => {
    fetchSpans(0);
  }, [fetchSpans]);

  // Filter and sort spans
  const filteredSpans = useMemo(() => {
    let result = [...spans];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (span) =>
          span.operation_name.toLowerCase().includes(query) ||
          span.thread_id?.toLowerCase().includes(query) ||
          span.span_id.toLowerCase().includes(query)
      );
    }

    result.sort((a, b) => {
      const timeA = a.start_time_us;
      const timeB = b.start_time_us;
      return sortDirection === "desc" ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [spans, searchQuery, sortDirection]);

  // Selection handlers
  const toggleSpanSelection = (spanId: string) => {
    const next = new Set(selectedSpanIds);
    if (next.has(spanId)) {
      next.delete(spanId);
    } else {
      next.add(spanId);
    }
    onSelectionChange(next);
  };

  const toggleSelectAll = () => {
    if (selectedSpanIds.size === filteredSpans.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(filteredSpans.map((s) => s.span_id)));
    }
  };

  // Pagination handlers
  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      fetchSpans(Math.max(0, pagination.offset - PAGE_SIZE));
    }
  };

  const handleNextPage = () => {
    if (pagination.offset + PAGE_SIZE < pagination.total) {
      fetchSpans(pagination.offset + PAGE_SIZE);
    }
  };

  const currentPage = Math.floor(pagination.offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(pagination.total / PAGE_SIZE);

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
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {/* Spans list */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SpansList
          isLoading={isLoading}
          error={error}
          searchQuery={searchQuery}
          filteredSpans={filteredSpans}
          selectedSpanIds={selectedSpanIds}
          onRetry={() => fetchSpans(0)}
          onToggleSelectAll={toggleSelectAll}
          onToggleSpanSelection={toggleSpanSelection}
          formatTime={formatTime}
        />
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 flex-shrink-0">
          <p className="text-sm text-muted-foreground">
            Showing {pagination.offset + 1}-
            {Math.min(pagination.offset + PAGE_SIZE, pagination.total)} of{" "}
            {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={pagination.offset === 0}
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
              disabled={pagination.offset + PAGE_SIZE >= pagination.total}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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
