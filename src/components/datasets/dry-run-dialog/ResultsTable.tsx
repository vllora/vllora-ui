/**
 * ResultsTable
 *
 * Virtualized table for displaying evaluation results during dry run execution.
 * Shows status, score, and reason/error for each evaluated sample.
 * Uses @tanstack/react-virtual for efficient rendering of large result sets.
 */

import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { EvaluationResultResponse } from "@/services/finetune-api";

type EvaluationResult = EvaluationResultResponse["results"][number];

const ROW_HEIGHT = 36; // Height of each row in pixels

interface ResultsTableProps {
  results: EvaluationResult[];
  /** Maximum height of the table container */
  maxHeight?: number;
}

export function ResultsTable({ results, maxHeight = 200 }: ResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Sort results by row_index
  const sortedResults = useMemo(
    () => [...results].sort((a, b) => a.row_index - b.row_index),
    [results]
  );

  const virtualizer = useVirtualizer({
    count: sortedResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  if (sortedResults.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 flex text-xs font-medium">
        <div className="w-12 p-2">#</div>
        <div className="w-20 p-2">Status</div>
        <div className="w-16 p-2">Score</div>
        <div className="flex-1 p-2">Reason / Error</div>
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="overflow-y-auto"
        style={{ maxHeight }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const result = sortedResults[virtualRow.index];
            return (
              <div
                key={result.dataset_row_id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="flex text-xs border-t hover:bg-muted/30"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Row number */}
                <div className="w-12 p-2 font-mono text-muted-foreground flex items-center">
                  {result.row_index + 1}
                </div>

                {/* Status */}
                <div className="w-20 p-2 flex items-center">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-xs font-medium",
                      result.status === "completed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : result.status === "failed"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    )}
                  >
                    {result.status}
                  </span>
                </div>

                {/* Score */}
                <div className="w-16 p-2 flex items-center">
                  {result.score != null && result.status === "completed" ? (
                    <span
                      className={cn(
                        "font-mono",
                        result.score >= 0.7
                          ? "text-emerald-600 dark:text-emerald-400"
                          : result.score >= 0.4
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {(result.score * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>

                {/* Reason / Error */}
                <div
                  className="flex-1 p-2 truncate text-muted-foreground flex items-center"
                  title={result.reason || result.error_message}
                >
                  {result.error_message ? (
                    <span className="text-amber-500 truncate">{result.error_message}</span>
                  ) : result.reason ? (
                    <span className="truncate">{result.reason}</span>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
