/**
 * RecordsSectionHeader
 *
 * View controls bar below the overview card.
 * Shows record stats on left as clickable filter chips (P0-19), Export button and ViewModeToggle on right.
 */

import { useState, useEffect } from "react";
import { Download, Copy, CheckCheck, Loader2, X } from "lucide-react";
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
  datasetId?: string;
  /** Active stat filter (P0-19) */
  activeStatFilter?: StatFilter;
  /** Called when a stat chip is clicked to filter (P0-19) */
  onStatFilterChange?: (filter: StatFilter) => void;
}

export function RecordsSectionHeader({
  viewMode,
  onViewModeChange,
  onExport,
  records,
  datasetId,
  activeStatFilter = "all",
  onStatFilterChange,
}: RecordsSectionHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  // Listen for data generation progress events
  useEffect(() => {
    const handleProgress = (event: {
      datasetId: string;
      status: string;
      completed?: number;
      total?: number;
    }) => {
      if (datasetId && event.datasetId !== datasetId) return;

      if ((event.status === 'started' || event.status === 'progress') &&
          event.completed !== undefined && event.total !== undefined) {
        setGenerationProgress({ completed: event.completed, total: event.total });
      } else if (event.status === 'completed' || event.status === 'failed') {
        setGenerationProgress(null);
      }
    };

    emitter.on('vllora_data_generation_progress', handleProgress);
    return () => {
      emitter.off('vllora_data_generation_progress', handleProgress);
    };
  }, [datasetId]);

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

  const handleCopyId = async () => {
    if (!datasetId) return;
    try {
      await navigator.clipboard.writeText(datasetId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
          label="from spans"
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
        {datasetId && (
          <>
            <span className="text-border">·</span>
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              title={`Copy dataset ID: ${datasetId}`}
            >
              <span>ID:</span>
              <span className="font-mono">
                {datasetId.length > 12
                  ? `${datasetId.slice(0, 5)}...${datasetId.slice(-5)}`
                  : datasetId}
              </span>
              {copied ? (
                <CheckCheck className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Generation progress indicator */}
        {generationProgress && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs px-2 py-1 bg-emerald-500/10 rounded-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>
              Generating {generationProgress.completed}/{generationProgress.total}
            </span>
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
          : "hover:bg-muted hover:text-foreground"
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
