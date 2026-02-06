/**
 * RecordsSectionHeader
 *
 * View controls bar below the overview card.
 * Shows record stats on left (like footer), Export button and ViewModeToggle on right.
 */

import { useState } from "react";
import { Download, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";
import type { DatasetRecord } from "@/types/dataset-types";

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
