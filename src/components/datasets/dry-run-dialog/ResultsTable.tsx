/**
 * ResultsTable
 *
 * Virtualized card-based display for evaluation results during dry run execution.
 * Shows status, score, and reason/error for each evaluated sample.
 * Includes search, filter, and sort functionality.
 * Uses @tanstack/react-virtual for efficient rendering of large result sets.
 */

import { useRef, useState, useMemo } from "react";
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
import {
  Search,
  Filter,
  ArrowUpDown,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { EvaluationResultResponse } from "@/services/finetune-api";

type EvaluationResult = EvaluationResultResponse["results"][number];

type SortOption = "index" | "score-asc" | "score-desc" | "status";

const CARD_HEIGHT = 72; // Height of each card in pixels
const CARD_GAP = 8; // Gap between cards

interface ResultsTableProps {
  results: EvaluationResult[];
  /** Maximum height of the results container. If not set, fills available space */
  maxHeight?: number;
  /** Whether to fill available height (use flex-1) */
  fillHeight?: boolean;
}

/**
 * Highlights keywords in error/reason text with styled badges
 */
function HighlightedText({ text }: { text: string }) {
  // Keywords to highlight (common error patterns)
  const keywords = [
    "model",
    "model_params",
    "completion_params",
    "prompt_v2",
    "required",
    "error",
    "failed",
    "timeout",
    "invalid",
  ];

  // Split text by keywords and highlight them
  const parts: Array<{ text: string; isKeyword: boolean }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    let foundKeyword = false;
    for (const keyword of keywords) {
      const lowerRemaining = remaining.toLowerCase();
      const index = lowerRemaining.indexOf(keyword.toLowerCase());
      if (index !== -1) {
        // Add text before keyword
        if (index > 0) {
          parts.push({ text: remaining.slice(0, index), isKeyword: false });
        }
        // Add keyword
        parts.push({
          text: remaining.slice(index, index + keyword.length),
          isKeyword: true,
        });
        remaining = remaining.slice(index + keyword.length);
        foundKeyword = true;
        break;
      }
    }
    if (!foundKeyword) {
      parts.push({ text: remaining, isKeyword: false });
      break;
    }
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.isKeyword ? (
          <code
            key={i}
            className="mx-0.5 px-1 py-0.5 rounded bg-red-500/15 text-red-400 font-mono text-[11px]"
          >
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

/**
 * Result card component with refined dark theme styling
 */
function ResultCard({ result, index }: { result: EvaluationResult; index: number }) {
  const isSuccess = result.status === "completed" && !result.error_message;
  const isFailed = result.status === "failed" || !!result.error_message;
  const isPending = result.status === "pending" || result.status === "running";

  // Show appropriate message based on status
  const message = isPending
    ? "Waiting for evaluation..."
    : result.error_message || result.reason || "Evaluation completed";

  return (
    <div
      className={cn(
        "flex items-stretch rounded-md overflow-hidden",
        "bg-zinc-900/80 border border-zinc-800",
        "hover:bg-zinc-900 hover:border-zinc-700 transition-colors"
      )}
    >
      {/* Colored left border indicator */}
      <div
        className={cn(
          "w-1 shrink-0",
          isSuccess
            ? "bg-emerald-500"
            : isFailed
            ? "bg-red-500"
            : isPending
            ? "bg-zinc-600"
            : "bg-amber-500"
        )}
      />

      {/* Row info column */}
      <div className="flex flex-col items-center justify-center px-3 py-2 min-w-[72px] border-r border-zinc-800">
        <span className="text-xs font-mono text-zinc-500">
          #{String(index + 1).padStart(3, "0")}
        </span>
        <span
          className={cn(
            "mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
            isSuccess
              ? "bg-emerald-500/15 text-emerald-400"
              : isFailed
              ? "bg-red-500/15 text-red-400"
              : isPending
              ? "bg-zinc-700/50 text-zinc-500"
              : "bg-amber-500/15 text-amber-400"
          )}
        >
          {isSuccess ? "OK" : isFailed ? "FAIL" : isPending ? "WAIT" : result.status.toUpperCase()}
        </span>
      </div>

      {/* Score column */}
      <div className="flex flex-col items-center justify-center px-3 py-2 min-w-[64px] border-r border-zinc-800">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
          Score
        </span>
        {result.score != null && isSuccess ? (
          <span
            className={cn(
              "mt-0.5 text-lg font-semibold tabular-nums",
              result.score >= 0.7
                ? "text-emerald-400"
                : result.score >= 0.4
                ? "text-amber-400"
                : "text-red-400"
            )}
          >
            {result.score.toFixed(2)}
          </span>
        ) : (
          <span className="mt-0.5 text-lg text-zinc-600">—</span>
        )}
      </div>

      {/* Message column */}
      <div className="flex-1 flex items-center gap-2.5 px-3 py-2 min-w-0">
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500/80" />
        ) : isFailed ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500/80" />
        ) : (
          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin" />
        )}
        <span className={cn("text-sm truncate", isPending ? "text-zinc-500" : "text-zinc-300")}>
          {isFailed ? (
            <HighlightedText text={message} />
          ) : (
            message
          )}
        </span>
      </div>
    </div>
  );
}

export function ResultsTable({ results, maxHeight = 400, fillHeight = false }: ResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("index");

  // Filter and sort results
  const processedResults = useMemo(() => {
    let filtered = [...results];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
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

  // Virtualizer for efficient rendering of large lists
  const virtualizer = useVirtualizer({
    count: processedResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + CARD_GAP,
    overscan: 5,
  });

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No results available
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", fillHeight && "flex flex-col h-full")}>
      {/* Search and filter controls */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search errors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm bg-zinc-900/50 border-zinc-800 placeholder:text-zinc-600 focus-visible:ring-zinc-700"
          />
        </div>

        <Button
          variant={showOnlyFailed ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowOnlyFailed(!showOnlyFailed)}
          className={cn(
            "h-8 gap-1.5 text-xs",
            showOnlyFailed
              ? "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
              : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"
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
              className="h-8 gap-1.5 text-xs border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            >
              <ArrowUpDown className="h-3 w-3" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
            <DropdownMenuItem onClick={() => setSortOption("index")} className="text-xs">
              By Row Index
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-desc")} className="text-xs">
              Score (High → Low)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-asc")} className="text-xs">
              Score (Low → High)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("status")} className="text-xs">
              By Status
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Virtualized results cards */}
      <div
        ref={parentRef}
        className={cn(
          "overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/50",
          fillHeight && "flex-1 min-h-0"
        )}
        style={fillHeight ? undefined : { maxHeight }}
      >
        {processedResults.length > 0 ? (
          <div
            className="p-2"
            style={{
              height: `${virtualizer.getTotalSize() + 16}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const result = processedResults[virtualRow.index];
              return (
                <div
                  key={result.dataset_row_id}
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    right: 8,
                    width: "calc(100% - 16px)",
                    height: `${CARD_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ResultCard result={result} index={result.row_index} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No results match your filters
          </div>
        )}
      </div>
    </div>
  );
}
