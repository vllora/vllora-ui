/**
 * RecordsSectionHeader
 *
 * View controls bar below the overview card.
 * Shows record stats on left as clickable filter chips (P0-19), Export button and ViewModeToggle on right.
 */

import { useState, useEffect, useRef } from "react";
import { Download, Loader2, X, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";
import type { DatasetRecord } from "@/types/dataset-types";
import type { StatFilter } from "../record-filters";
import { emitter } from "@/utils/eventEmitter";
import { cn } from "@/lib/utils";

export interface RecordsSectionHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
  records: DatasetRecord[];
  workflowId?: string;
  /** Active stat filter (P0-19) */
  activeStatFilter?: StatFilter;
  /** Called when a stat chip is clicked to filter (P0-19) */
  onStatFilterChange?: (filter: StatFilter) => void;
  /** Search query for filtering records */
  searchQuery?: string;
  /** Called when search query changes */
  onSearchChange?: (query: string) => void;
  /** Active source document filter name (for showing dismissible chip) */
  sourceDocumentFilterName?: string | null;
  /** Called to clear the source document filter */
  onClearSourceDocumentFilter?: () => void;
}

export function RecordsSectionHeader({
  viewMode,
  onViewModeChange,
  onExport,
  records,
  workflowId,
  activeStatFilter = "all",
  onStatFilterChange,
  searchQuery = "",
  onSearchChange,
  sourceDocumentFilterName,
  onClearSourceDocumentFilter,
}: RecordsSectionHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [generationProgress, setGenerationProgress] = useState<{
    completed: number;
    total: number;
    topicName?: string;
  } | null>(null);

  // Listen for data generation progress events
  useEffect(() => {
    const handleProgress = (event: {
      workflowId: string;
      status: string;
      completed?: number;
      total?: number;
      currentTopic?: string;
    }) => {
      if (workflowId && event.workflowId !== workflowId) return;

      if ((event.status === 'started' || event.status === 'progress') &&
          event.completed !== undefined && event.total !== undefined) {
        setGenerationProgress({ completed: event.completed, total: event.total, topicName: event.currentTopic });
      } else if (event.status === 'completed' || event.status === 'failed') {
        setGenerationProgress(null);
      }
    };

    emitter.on('vllora_data_generation_progress', handleProgress);
    return () => {
      emitter.off('vllora_data_generation_progress', handleProgress);
    };
  }, [workflowId]);

  // Calculate summary stats (same as footer)
  const totalRecords = records.length;
  const fromSpans = records.filter((r) => r.spanId).length;
  const withTopic = records.filter((r) => r.topic).length;
  const withEvaluation = records.filter((r) => r.evaluation?.score !== undefined).length;

  // Get unique topics
  const topics = new Set<string>();
  records.forEach((r) => {
    if (r.topic) topics.add(r.topic);
  });
  const topicCount = topics.size;

  // P0-19: Clicking a stat toggles filter; clicking same filter clears it
  const handleStatClick = (filter: StatFilter) => {
    if (!onStatFilterChange) return;
    if (activeStatFilter === filter) {
      onStatFilterChange("all");
    } else {
      onStatFilterChange(filter);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-background min-h-8">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {totalRecords === 0 ? (
          <span className="text-muted-foreground">No records yet</span>
        ) : (
          <>
            {/* P0-19: Clickable stat chips */}
            <StatChip
              count={totalRecords}
              label="records"
              isActive={activeStatFilter === "all"}
              onClick={() => handleStatClick("all")}
              clickable={!!onStatFilterChange}
            />
            <span className="text-border">·</span>
            <StatChip
              count={fromSpans}
              label="from traces"
              isActive={activeStatFilter === "from_spans"}
              onClick={() => handleStatClick("from_spans")}
              clickable={!!onStatFilterChange}
            />
            <span className="text-border">·</span>
            <StatChip
              count={topicCount}
              label="topics"
              isActive={false}
              onClick={() => {}}
              clickable={false}
            />
            <span className="text-border">·</span>
            <StatChip
              count={withTopic}
              label="labeled"
              isActive={activeStatFilter === "labeled"}
              onClick={() => handleStatClick("labeled")}
              clickable={!!onStatFilterChange}
            />
            <span className="text-border">·</span>
            <StatChip
              count={withEvaluation}
              label="evaluated"
              isActive={activeStatFilter === "evaluated"}
              onClick={() => handleStatClick("evaluated")}
              clickable={!!onStatFilterChange}
            />
            {/* Source document filter chip */}
            {sourceDocumentFilterName && onClearSourceDocumentFilter && (
              <>
                <span className="text-border">·</span>
                <button
                  onClick={onClearSourceDocumentFilter}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400"
                >
                  <FileText className="w-3 h-3" />
                  <span className="text-xs truncate max-w-[120px]">{sourceDocumentFilterName}</span>
                  <X className="w-3 h-3 ml-0.5" />
                </button>
              </>
            )}
            {/* Show clear filter indicator when a filter is active */}
            {activeStatFilter !== "all" && onStatFilterChange && (
              <>
                <span className="text-border">·</span>
                <button
                  onClick={() => onStatFilterChange("all")}
                  className="inline-flex items-center gap-1 text-[rgb(var(--theme-500))] hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span className="text-xs">Clear</span>
                </button>
              </>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Generation progress indicator */}
        {generationProgress && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs px-2 py-1 bg-emerald-500/10 rounded-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>
              {generationProgress.topicName
                ? `Generating for ${generationProgress.topicName}: ${generationProgress.completed}/${generationProgress.total}`
                : `Generating ${generationProgress.completed}/${generationProgress.total}`}
            </span>
          </div>
        )}
        {/* Search */}
        {onSearchChange && (
          <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-md px-2 h-7">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search records..."
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none w-36"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  onSearchChange("");
                  searchInputRef.current?.blur();
                }
              }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 gap-1.5 text-xs"
          onClick={onExport}
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
    </div>
  );
}

/** P0-19: Clickable stat chip component */
function StatChip({
  count,
  label,
  isActive,
  onClick,
  clickable,
}: {
  count: number;
  label: string;
  isActive: boolean;
  onClick: () => void;
  clickable: boolean;
}) {
  if (!clickable) {
    return (
      <span>
        <span className="font-medium text-foreground">{count}</span> {label}
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
        isActive
          ? "bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-500))]"
          : "hover:bg-muted hover:text-foreground hover:underline decoration-[rgba(var(--theme-500),0.4)] underline-offset-2"
      )}
    >
      <span className={cn(
        "font-medium",
        isActive ? "text-[rgb(var(--theme-500))]" : "text-foreground"
      )}>
        {count}
      </span>
      {label}
    </button>
  );
}
