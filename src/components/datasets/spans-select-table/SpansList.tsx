/**
 * SpansList
 *
 * Virtualized list component for displaying and selecting spans.
 * Supports expandable rows, selection, and virtual scrolling.
 */

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import type { Span } from "@/types/common-type";
import { useVirtualizer } from "@tanstack/react-virtual";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { cn } from "@/lib/utils";
import { ConversationThreadCell, SelectionCheckbox, StatsBadge, FormattedThreadPanel } from "../records-table/cells";

const ROW_HEIGHT = 100;

export interface SpansListProps {
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filteredSpans: Span[];
  selectedSpanIds: Set<string>;
  onRetry: () => void;
  onToggleSelectAll: () => void;
  onToggleSpanSelection: (spanId: string) => void;
  formatTime: (microseconds: number) => string;
}

export function SpansList({
  isLoading,
  error,
  searchQuery,
  filteredSpans,
  selectedSpanIds,
  onRetry,
  onToggleSelectAll,
  onToggleSpanSelection,
  formatTime,
}: SpansListProps) {
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
    <div className="h-full max-w-full border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center px-3 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="w-6 shrink-0" /> {/* Spacer for expand button */}
        <div className="w-6 shrink-0 flex justify-center">
          <SelectionCheckbox
            checked={selectedSpanIds.size === filteredSpans.length && filteredSpans.length > 0}
            onChange={onToggleSelectAll}
          />
        </div>
        <span className="text-sm font-medium flex-[3] min-w-0 px-2">Message Preview</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Stats</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Provider</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-center">Span ID</span>
        <span className="text-sm font-medium flex-1 min-w-0 px-2 text-right">Time</span>
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
                    "flex items-center px-3 py-2 cursor-pointer transition-colors",
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

                  <div className="w-6 shrink-0 flex justify-center">
                    <SelectionCheckbox
                      checked={selectedSpanIds.has(span.span_id)}
                      onChange={() => onToggleSpanSelection(span.span_id)}
                    />
                  </div>
                  <div className="flex-[3] min-w-0 px-2">
                    <ConversationThreadCell data={dataInfo} />
                  </div>
                  <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
                    <StatsBadge data={dataInfo} />
                  </div>
                  <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted text-xs font-medium truncate">
                      {span.operation_name}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 px-2 flex items-center justify-center">
                    <SpanIdCell spanId={span.span_id} />
                  </div>
                  <div className="flex-1 min-w-0 px-2 flex items-center justify-end text-sm text-muted-foreground">
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

/**
 * SpanId cell with truncated display and copy functionality
 */
function SpanIdCell({ spanId }: { spanId: string }) {
  const [copied, setCopied] = useState(false);

  const truncatedId = spanId.length > 8
    ? `${spanId.slice(0, 4)}...${spanId.slice(-4)}`
    : spanId;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(spanId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      title={`Click to copy: ${spanId}`}
    >
      {truncatedId}
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}
