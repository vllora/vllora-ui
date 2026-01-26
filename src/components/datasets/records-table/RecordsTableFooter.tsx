/**
 * RecordsTableFooter
 *
 * Footer for the records table showing summary statistics and dataset ID.
 */

import { useState } from "react";
import { Copy, CheckCheck } from "lucide-react";
import { DatasetRecord } from "@/types/dataset-types";

export interface RecordsTableFooterProps {
  records: DatasetRecord[];
  selectedCount?: number;
  datasetId?: string;
}

export function RecordsTableFooter({
  records,
  selectedCount = 0,
  datasetId,
}: RecordsTableFooterProps) {
  const [copied, setCopied] = useState(false);

  // Calculate summary stats
  const totalRecords = records.length;
  const fromSpans = records.filter((r) => r.spanId).length;
  const withTopic = records.filter((r) => r.topic).length;
  const withEvaluation = records.filter((r) => r.evaluation?.score !== undefined).length;

  // Get unique topics
  const topics = new Map<string, number>();
  records.forEach((r) => {
    if (r.topic) {
      topics.set(r.topic, (topics.get(r.topic) || 0) + 1);
    }
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
    <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        {selectedCount > 0 && (
          <>
            <span className="text-[rgb(var(--theme-500))] font-medium">
              {selectedCount} selected
            </span>
            <span className="text-border">•</span>
          </>
        )}
        <span>
          <span className="font-medium text-foreground">{totalRecords}</span> records
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{fromSpans}</span> from spans
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{topicCount}</span> topics
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{withTopic}</span> labeled
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="font-medium text-foreground">{withEvaluation}</span> evaluated
        </span>
      </div>
      {datasetId && (
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          title={`Copy dataset ID: ${datasetId}`}
        >
          <span>ID:</span>
          <span className="font-mono">
            {datasetId.length > 12
              ? `${datasetId.slice(0, 5)}...${datasetId.slice(-5)}`
              : datasetId}
          </span>
          {copied ? (
            <CheckCheck className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
