/**
 * RecordsTableFooter
 *
 * Footer for the records table showing summary statistics, composition bar, and dataset ID.
 */

import { useState, useMemo } from "react";
import { Copy, CheckCheck } from "lucide-react";
import { DatasetRecord } from "@/types/dataset-types";
import type { DataInfo } from "@/types/dataset-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CompositionSegment {
  readonly label: string;
  readonly count: number;
  readonly color: string;
  readonly pct: number;
}

function computeComposition(records: readonly DatasetRecord[]): {
  readonly origin: readonly CompositionSegment[];
  readonly format: readonly CompositionSegment[];
} {
  let seedCount = 0;
  let syntheticCount = 0;
  let toolCallingCount = 0;
  let textOnlyCount = 0;

  for (const r of records) {
    // Origin: seed (from traces) vs synthetic
    const promptType = (r.metadata?.prompt_type as string) ?? "";
    if (promptType === "seed_query") seedCount++;
    else syntheticCount++;

    // Format: tool-calling (has tools in input) vs text-only
    const data = r.data as DataInfo | null;
    const hasTools = Array.isArray(data?.input?.tools) && data.input.tools.length > 0;
    if (hasTools) toolCallingCount++;
    else textOnlyCount++;
  }

  const total = records.length || 1;
  return {
    origin: [
      { label: "Seed (traces)", count: seedCount, color: "bg-blue-500", pct: Math.round((seedCount / total) * 100) },
      { label: "Synthetic", count: syntheticCount, color: "bg-zinc-500", pct: Math.round((syntheticCount / total) * 100) },
    ].filter(s => s.count > 0),
    format: [
      { label: "Tool-calling", count: toolCallingCount, color: "bg-emerald-500", pct: Math.round((toolCallingCount / total) * 100) },
      { label: "Text-only", count: textOnlyCount, color: "bg-amber-500", pct: Math.round((textOnlyCount / total) * 100) },
    ].filter(s => s.count > 0),
  };
}

function CompositionBar({ segments, label }: { readonly segments: readonly CompositionSegment[]; readonly label: string }) {
  if (segments.length <= 1) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <span className="text-muted-foreground">{label}:</span>
            <div className="flex h-2 w-16 rounded-full overflow-hidden bg-muted/50">
              {segments.map(s => (
                <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${s.pct}%` }} />
              ))}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs bg-zinc-900 border-zinc-700">
          {segments.map(s => (
            <div key={s.label} className="flex items-center gap-1.5 py-0.5">
              <span className={`w-2 h-2 rounded-full ${s.color}`} />
              <span>{s.label}: {s.count} ({s.pct}%)</span>
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface RecordsTableFooterProps {
  records: DatasetRecord[];
  selectedCount?: number;
  workflowId?: string;
  /** Total records on server (may exceed records.length when paginated) */
  totalRecordsFromServer?: number;
}

export function RecordsTableFooter({
  records,
  selectedCount = 0,
  workflowId,
  totalRecordsFromServer,
}: RecordsTableFooterProps) {
  const [copied, setCopied] = useState(false);

  // Calculate summary stats
  const totalRecords = totalRecordsFromServer ?? records.length;
  const fromSpans = records.filter((r) => r.spanId).length;
  const withTopic = records.filter((r) => r.topic).length;
  const withEvaluation = records.filter((r) => r.evaluation?.score !== undefined).length;

  // Composition breakdown
  const composition = useMemo(() => computeComposition(records), [records]);

  // Get unique topics
  const topics = new Map<string, number>();
  records.forEach((r) => {
    if (r.topic) {
      topics.set(r.topic, (topics.get(r.topic) || 0) + 1);
    }
  });
  const topicCount = topics.size;

  const handleCopyId = async () => {
    if (!workflowId) return;
    try {
      await navigator.clipboard.writeText(workflowId);
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
        {composition.origin.length > 1 && (
          <>
            <span className="text-border">•</span>
            <CompositionBar segments={composition.origin} label="Origin" />
          </>
        )}
        {composition.format.length > 1 && (
          <>
            <span className="text-border">•</span>
            <CompositionBar segments={composition.format} label="Format" />
          </>
        )}
      </div>
      {workflowId && (
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          title={`Copy dataset ID: ${workflowId}`}
        >
          <span>ID:</span>
          <span className="font-mono">
            {workflowId.length > 12
              ? `${workflowId.slice(0, 5)}...${workflowId.slice(-5)}`
              : workflowId}
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
