/**
 * DocsProcessingState
 *
 * State shown when documents are still being processed.
 * Provides link to switch to Docs tab to see progress.
 */

import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";

interface DocsProcessingStateProps {
  datasetId: string;
  processingCount: number;
  totalCount: number;
  className?: string;
}

export function DocsProcessingState({
  datasetId,
  processingCount,
  totalCount,
  className,
}: DocsProcessingStateProps) {
  const handleViewDocs = () => {
    emitter.emit("vllora_switch_tab", { datasetId, tab: "docs" });
  };

  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
          <FileText className="w-8 h-8 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            Processing Reference documents
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {processingCount} of {totalCount} document{totalCount !== 1 ? "s" : ""} still processing.
            The setup plan will be generated automatically once complete.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[rgb(var(--theme-500))]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Extracting content and topics...</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleViewDocs}>
          <FileText className="w-4 h-4 mr-2" />
          View Reference Docs
        </Button>
      </div>
    </div>
  );
}
