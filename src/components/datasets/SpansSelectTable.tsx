/**
 * SpansSelectTable
 *
 * A reusable component for selecting spans from the gateway.
 * Includes search, sort, pagination, and virtual scrolling.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { listSpans, type PaginatedSpansResponse } from "@/services/spans-api";
import type { Span } from "@/types/common-type";
import { formatDistanceToNow } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { cn } from "@/lib/utils";
import { ConversationThreadCell, SelectionCheckbox, StatsBadge, FormattedThreadPanel } from "./records-table/cells";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 100;

// Operation names to include (LLM provider spans)
const INCLUDED_OPERATION_NAMES = ["openai", "gemini", "anthropic", "bedrock"];

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

  // Fetch spans
  const fetchSpans = useCallback(
    async (offset = 0) => {
      if (!projectId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response: PaginatedSpansResponse = await listSpans({
          projectId,
          params: {
            limit: PAGE_SIZE,
            offset,
            operationNames: INCLUDED_OPERATION_NAMES.join(","),
          },
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
    [projectId, onSpansLoaded]
  );

  // Load spans on mount
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by operation or thread ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
          className="gap-2"
        >
          <ArrowUpDown className="h-4 w-4" />
          {sortDirection === "desc" ? "Newest first" : "Oldest first"}
        </Button>
      </div>

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

/**
 * Virtualized spans list component
 */
function SpansList({
  isLoading,
  error,
  searchQuery,
  filteredSpans,
  selectedSpanIds,
  onRetry,
  onToggleSelectAll,
  onToggleSpanSelection,
  formatTime,
}: {
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filteredSpans: Span[];
  selectedSpanIds: Set<string>;
  onRetry: () => void;
  onToggleSelectAll: () => void;
  onToggleSpanSelection: (spanId: string) => void;
  formatTime: (microseconds: number) => string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((spanId: string) => {
    setExpandedSpanIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: filteredSpans.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  if (isLoading) {
    return (
      <div className="h-full border border-border rounded-lg bg-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full border border-border rounded-lg bg-card flex flex-col items-center justify-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (filteredSpans.length === 0) {
    return (
      <div className="h-full border border-border rounded-lg bg-card flex items-center justify-center text-muted-foreground">
        {searchQuery ? "No spans match your search." : "No spans found."}
      </div>
    );
  }

  return (
    <div className="h-full border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="w-6" /> {/* Spacer for expand button */}
        <SelectionCheckbox
          checked={selectedSpanIds.size === filteredSpans.length && filteredSpans.length > 0}
          onChange={onToggleSelectAll}
        />
        <span className="text-sm font-medium flex-1">Message Preview</span>
        <span className="text-sm font-medium w-20">Stats</span>
        <span className="text-sm font-medium w-20">Provider</span>
        <span className="text-sm font-medium w-24 text-right">Time</span>
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const span = filteredSpans[virtualRow.index];
            const dataInfo = extractDataInfoFromSpan(span);
            const isExpanded = expandedSpanIds.has(span.span_id);

            return (
              <div
                key={span.span_id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  "flex flex-col border-b border-border",
                  isExpanded && "border-border/60 shadow-md"
                )}
              >
                {/* Main row */}
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors",
                    !isExpanded && "hover:bg-muted/20",
                    selectedSpanIds.has(span.span_id) && "bg-[rgb(var(--theme-500))]/5",
                    isExpanded && "bg-zinc-800/50"
                  )}
                  onClick={() => onToggleSpanSelection(span.span_id)}
                >
                  {/* Expand/Collapse toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(span.span_id);
                    }}
                    className="w-6 h-6 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  <SelectionCheckbox
                    checked={selectedSpanIds.has(span.span_id)}
                    onChange={() => onToggleSpanSelection(span.span_id)}
                  />
                  <ConversationThreadCell data={dataInfo} />
                  <div className="w-20">
                    <StatsBadge data={dataInfo} />
                  </div>
                  <div className="w-20">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs font-medium">
                      {span.operation_name}
                    </span>
                  </div>
                  <div className="w-24 text-right text-sm text-muted-foreground">
                    {formatTime(span.start_time_us)}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="bg-zinc-900/40 border-t border-border/30">
                    <div className="p-4">
                      <FormattedThreadPanel data={dataInfo} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
