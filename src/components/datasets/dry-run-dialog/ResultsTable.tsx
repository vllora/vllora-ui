/**
 * ResultsTable
 *
 * Virtualized table display for evaluation results during dry run execution.
 * Shows row index, score, status, and reasoning for each evaluated sample.
 * Includes search, filter, and sort functionality.
 * Uses @tanstack/react-virtual for efficient rendering of large result sets.
 */

import { useRef, useState, useMemo, useEffect, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Filter, ChevronDown, HelpCircle } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";
import type { FlatEvaluationResult } from "@/services/finetune-api";
import { DryrunEvaluationResultRow } from "./DryrunEvaluationResultRow";

type EvaluationResult = FlatEvaluationResult;

type SortOption = "index" | "score-asc" | "score-desc" | "status";

const SORT_LABELS: Record<SortOption, string> = {
  index: "Row ID",
  "score-asc": "Score (Low)",
  "score-desc": "Score (High)",
  status: "Status",
};

const ROW_HEIGHT = 34; // Height of each row in pixels

interface ResultsTableProps {
  results: EvaluationResult[];
  /** Maximum height of the results container. If not set, fills available space */
  maxHeight?: number;
  /** Whether to fill available height (use flex-1) */
  fillHeight?: boolean;
  /** ID of the currently expanded row (enables expand behavior when onRowClick is set) */
  expandedRowId?: string | null;
  /** Callback when a row is clicked — controls expand toggle from parent */
  onRowClick?: (result: EvaluationResult) => void;
  /** Render function for the content shown below an expanded row */
  renderExpandedContent?: (result: EvaluationResult) => ReactNode;
  /** Callback when record ID is clicked — enables navigation to record. Shows ID column when set. */
  onRecordIdClick?: (recordId: string) => void;
}

export function ResultsTable({
  results,
  maxHeight = 400,
  fillHeight = false,
  expandedRowId,
  onRowClick,
  renderExpandedContent,
  onRecordIdClick,
}: ResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("index");
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);

  // Filter and sort results
  const processedResults = useMemo(() => {
    let filtered = [...results];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.dataset_row_id?.toLowerCase().includes(query) ||
          r.error_message?.toLowerCase().includes(query) ||
          r.reason?.toLowerCase().includes(query) ||
          r.status.toLowerCase().includes(query)
      );
    }

    // Apply failed filter
    if (showOnlyFailed) {
      filtered = filtered.filter(
        (r) => r.status === "failed" || !!r.error_message
      );
    }

    // Apply sorting
    switch (sortOption) {
      case "index":
        filtered.sort((a, b) => a.row_index - b.row_index);
        break;
      case "score-asc":
        filtered.sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
        break;
      case "score-desc":
        filtered.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        break;
      case "status":
        filtered.sort((a, b) => {
          const statusOrder = { failed: 0, pending: 1, completed: 2 };
          return (
            (statusOrder[a.status as keyof typeof statusOrder] ?? 1) -
            (statusOrder[b.status as keyof typeof statusOrder] ?? 1)
          );
        });
        break;
    }

    return filtered;
  }, [results, searchQuery, showOnlyFailed, sortOption]);

  const isExpandable = !!onRowClick;

  // Virtualizer for efficient rendering of large lists
  const virtualizer = useVirtualizer({
    count: processedResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (expandedRowId && processedResults[index]?.dataset_row_id === expandedRowId) {
        return ROW_HEIGHT + 150;
      }
      return ROW_HEIGHT;
    },
    overscan: 5,
  });

  // Remeasure when expanded row changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedRowId, virtualizer]);

  // Listen for highlight events from QualityIndicator clicks
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const recordId = (e as CustomEvent).detail?.recordId;
      if (!recordId) return;

      // Find the row index in processedResults
      const index = processedResults.findIndex(
        (r) => r.dataset_row_id === recordId
      );
      if (index >= 0) {
        // Scroll to the row
        virtualizer.scrollToIndex(index, { align: 'center' });
        // Highlight it
        setHighlightedRowId(recordId);
        setTimeout(() => setHighlightedRowId(null), 2000);
      }
    };

    window.addEventListener('vllora_highlight_eval_result', handleHighlight);
    return () => {
      window.removeEventListener('vllora_highlight_eval_result', handleHighlight);
    };
  }, [processedResults, virtualizer]);

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No results available
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", fillHeight && "flex flex-col h-full")}>
      {/* Search and filter controls */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search rows or records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-zinc-900/50 border-zinc-700/50 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
          />
        </div>

        <Button
          variant={showOnlyFailed ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowOnlyFailed(!showOnlyFailed)}
          className={cn(
            "h-8 gap-1.5 text-xs",
            showOnlyFailed
              ? "bg-red-500/15 text-red-400 border-red-500/20 hover:bg-red-500/25"
              : "border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
          )}
        >
          <Filter className="h-3 w-3" />
          Failed only
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
            >
              Sort: {SORT_LABELS[sortOption]}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700/60">
            <DropdownMenuItem onClick={() => setSortOption("index")} className="text-xs text-zinc-300">
              Row ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-desc")} className="text-xs text-zinc-300">
              Score (High → Low)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-asc")} className="text-xs text-zinc-300">
              Score (Low → High)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("status")} className="text-xs text-zinc-300">
              Status
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table with header and virtualized rows */}
      <div className={cn("text-xs overflow-x-auto", fillHeight && "flex-1 flex flex-col min-h-0")}>
        {/* Table header */}
        <div className="flex items-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60 shrink-0 bg-zinc-900/20">
          <div className="w-6 shrink-0 py-2" />
          <div className="w-12 shrink-0 py-2 pr-2">#</div>
          {onRecordIdClick && <div className="w-24 shrink-0 py-2 pr-2">Record</div>}
          <div className="w-16 shrink-0 py-2 pr-2">
            <UITooltipProvider delayDuration={200}>
              <UITooltip>
                <UITooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-help">
                    Score
                    <HelpCircle className="h-2.5 w-2.5 text-zinc-600" />
                  </span>
                </UITooltipTrigger>
                <UITooltipContent side="bottom" className="max-w-[260px] text-xs p-3">
                  <p className="font-semibold mb-2">Score Color Guide</p>
                  <div className="space-y-1.5">
                    <p><span className="text-green-400 font-medium">Green ≥ 0.8</span> — High</p>
                    <p><span className="text-yellow-400 font-medium">Yellow ≥ 0.6</span> — Moderate</p>
                    <p><span className="text-red-400 font-medium">Red &lt; 0.6</span> — Low</p>
                  </div>
                  <p className="text-muted-foreground mt-2 border-t border-zinc-700 pt-2">
                    Scores reflect how well each sample performed against your grader criteria.
                  </p>
                </UITooltipContent>
              </UITooltip>
            </UITooltipProvider>
          </div>
          <div className="w-12 shrink-0 py-2 pr-2">Status</div>
          <div className="flex-1 py-2 pr-2">Reasoning</div>
          <div className="w-10 shrink-0 py-2 text-center">Logs</div>
        </div>

        {/* Virtualized rows */}
        <div
          ref={parentRef}
          className={cn("overflow-y-auto", fillHeight && "flex-1 min-h-0")}
          style={fillHeight ? undefined : { maxHeight }}
        >
          {processedResults.length > 0 ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const result = processedResults[virtualRow.index];
                const isExpanded = expandedRowId === result.dataset_row_id;
                return (
                  <div
                    key={result.dataset_row_id}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <DryrunEvaluationResultRow
                      result={result}
                      index={result.row_index}
                      isExpandable={isExpandable}
                      isExpanded={isExpanded}
                      isHighlighted={highlightedRowId === result.dataset_row_id}
                      onClick={onRowClick ? () => onRowClick(result) : undefined}
                      onRecordIdClick={onRecordIdClick}
                    />
                    {isExpanded && renderExpandedContent && (
                      <div className="border-t border-zinc-800/40 bg-zinc-900/30 px-6 py-2">
                        {renderExpandedContent(result)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-xs">
              No results match your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
