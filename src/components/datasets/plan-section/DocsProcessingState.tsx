/**
 * DocsProcessingState
 *
 * State shown when documents are still being processed.
 * Shows per-document filename with spinner/checkmark status.
 * Detects stuck processing (>30s) and shows warning.
 */

import { useState, useEffect } from "react";
import { FileText, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import type { KnowledgeSource } from "@/types/dataset-types";

interface DocsProcessingStateProps {
  datasetId: string;
  sources: KnowledgeSource[];
  className?: string;
}

export function DocsProcessingState({
  datasetId: _datasetId,
  sources,
  className,
}: DocsProcessingStateProps) {
  const [stuckIds, setStuckIds] = useState<Set<string>>(new Set());

  // Detect stuck processing: if a source stays "processing" for >30s
  useEffect(() => {
    const processingSources = sources.filter((s) => s.status === "processing");
    if (processingSources.length === 0) return;

    const timers = processingSources.map((source) => {
      return setTimeout(() => {
        setStuckIds((prev) => new Set(prev).add(source.id));
      }, 30000);
    });

    return () => timers.forEach(clearTimeout);
  }, [sources]);

  const handleViewDocs = () => {
    emitter.emit("vllora_open_drawer", { type: "docs" });
  };

  const readyCount = sources.filter((s) => s.status === "ready").length;
  const failedCount = sources.filter((s) => s.status === "failed").length;
  const totalCount = sources.length;

  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
          <FileText className="w-8 h-8 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            Processing Reference Documents
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {readyCount} of {totalCount} complete. The plan will be generated automatically once all documents finish.
          </p>
        </div>

        {/* Per-document status list */}
        <div className="w-full space-y-1.5 text-left">
          {sources.map((source) => {
            const isStuck = stuckIds.has(source.id);
            return (
              <div
                key={source.id}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-muted/30"
              >
                {source.status === "processing" ? (
                  isStuck ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-[rgb(var(--theme-500))] animate-spin shrink-0" />
                  )
                ) : source.status === "ready" ? (
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : source.status === "failed" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full bg-muted shrink-0" />
                )}
                <span className={cn(
                  "text-xs truncate flex-1",
                  source.status === "ready" && "text-muted-foreground",
                  source.status === "failed" && "text-destructive",
                  isStuck && "text-amber-500",
                )}>
                  {source.name}
                </span>
                {isStuck && (
                  <span className="text-[10px] text-amber-500 shrink-0">Slow</span>
                )}
                {source.status === "failed" && (
                  <span className="text-[10px] text-destructive shrink-0">Failed</span>
                )}
              </div>
            );
          })}
        </div>

        {failedCount > 0 && (
          <p className="text-xs text-destructive">
            {failedCount} document{failedCount !== 1 ? "s" : ""} failed to process.
          </p>
        )}

        <Button variant="outline" size="sm" onClick={handleViewDocs}>
          <FileText className="w-4 h-4 mr-2" />
          View Reference Docs
        </Button>
      </div>
    </div>
  );
}
