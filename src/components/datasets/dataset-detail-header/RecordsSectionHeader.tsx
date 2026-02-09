/**
 * RecordsSectionHeader
 *
 * View controls bar below the overview card.
 * Shows record stats on left (like footer), Export button and ViewModeToggle on right.
 */

import { useState, useEffect } from "react";
import { Download, Copy, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";
import type { DatasetRecord } from "@/types/dataset-types";
import { emitter } from "@/utils/eventEmitter";

export interface RecordsSectionHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
  records: DatasetRecord[];
  datasetId?: string;
}

export function RecordsSectionHeader({
  viewMode,
  onViewModeChange,
  onExport,
  records,
  datasetId,
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

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>
          <span className="font-medium text-zinc-300">{totalRecords}</span> records
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="font-medium text-zinc-300">{fromSpans}</span> from spans
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="font-medium text-zinc-300">{topicCount}</span> topics
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="font-medium text-zinc-300">{withTopic}</span> labeled
        </span>
        <span className="text-zinc-700">·</span>
        <span>
          <span className="font-medium text-zinc-300">{withEvaluation}</span> evaluated
        </span>
        {datasetId && (
          <>
            <span className="text-zinc-700">·</span>
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
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
