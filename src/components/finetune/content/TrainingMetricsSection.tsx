/**
 * TrainingMetricsSection
 *
 * Displays training metrics including epoch summary and charts for a finetune job.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2 } from "lucide-react";
import { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { TrainingMetricsChart } from "../TrainingMetricsChart";

interface TrainingMetricsSectionProps {
  evalResults: FinetuneEvalResultsResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function TrainingMetricsSection({
  evalResults,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
}: TrainingMetricsSectionProps) {
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={onRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading evaluation metrics...
        </div>
      ) : error ? (
        <div className="text-xs text-muted-foreground py-2">
          {error.includes('404') ? 'No evaluation metrics available yet' : error}
        </div>
      ) : evalResults && evalResults.results.length > 0 ? (
        <TrainingMetricsChart results={evalResults.results} />
      ) : (
        <div className="text-xs text-muted-foreground py-2">
          No evaluation metrics available yet
        </div>
      )}
    </div>
  );
}
