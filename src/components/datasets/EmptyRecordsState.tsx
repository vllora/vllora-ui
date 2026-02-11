/**
 * EmptyRecordsState
 *
 * Empty state component shown when a dataset has no records.
 * Shows loading state when data is being generated.
 * Minimal design - Lucy handles guidance via context injection.
 */

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";

interface GenerationProgress {
  status: "started" | "progress" | "completed" | "failed";
  total: number;
  completed: number;
  currentBatch?: number;
  totalBatches?: number;
  error?: string;
}

interface EmptyRecordsStateProps {
  datasetId: string;
  datasetObjective?: string;
  hasTopicHierarchy?: boolean;
}

export function EmptyRecordsState({ datasetId, datasetObjective }: EmptyRecordsStateProps) {
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);

  // Listen for generation progress events
  useEffect(() => {
    const handleProgress = (event: {
      datasetId: string;
      status: "started" | "progress" | "completed" | "failed";
      total: number;
      completed: number;
      currentBatch?: number;
      totalBatches?: number;
      error?: string;
    }) => {
      if (event.datasetId === datasetId) {
        setGenerationProgress({
          status: event.status,
          total: event.total,
          completed: event.completed,
          currentBatch: event.currentBatch,
          totalBatches: event.totalBatches,
          error: event.error,
        });

        // Clear progress after completion (records will show up via refresh)
        if (event.status === "completed" || event.status === "failed") {
          setTimeout(() => {
            setGenerationProgress(null);
          }, 2000);
        }
      }
    };

    emitter.on("vllora_data_generation_progress", handleProgress);
    return () => {
      emitter.off("vllora_data_generation_progress", handleProgress);
    };
  }, [datasetId]);

  const handleGetStarted = () => {
    // Simple prompt - Lucy already has full context via workflowToContext
    const prompt = datasetObjective
      ? "Help me generate training data for this dataset."
      : "Help me get started with this dataset.";
    emitter.emit("vllora_lucy_prompt", { prompt });
  };

  // Show loading state when generating
  if (generationProgress && (generationProgress.status === "started" || generationProgress.status === "progress")) {
    const progressPercent = generationProgress.total > 0
      ? Math.round((generationProgress.completed / generationProgress.total) * 100)
      : 0;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center">
          {/* Loading spinner */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgba(var(--theme-500),0.2)] to-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[rgb(var(--theme-500))] animate-spin" />
          </div>

          {/* Progress info */}
          <div className="space-y-2">
            <h3 className="text-base font-medium text-foreground">
              Generating training data...
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {generationProgress.totalBatches && generationProgress.currentBatch
                ? `Batch ${generationProgress.currentBatch} of ${generationProgress.totalBatches}`
                : "Starting generation..."}
            </p>
            {generationProgress.completed > 0 && (
              <p className="text-sm font-medium text-[rgb(var(--theme-500))]">
                {generationProgress.completed} of {generationProgress.total} examples created
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[rgb(var(--theme-500))] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        {/* Subtle decorative element */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgba(var(--theme-500),0.1)] to-[rgba(var(--theme-500),0.05)] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            {datasetObjective ? "Ready to generate data" : "Get started"}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {datasetObjective
              ? "Chat with Lucy to create training examples, upload reference docs, or import existing data."
              : "Define your training objective and Lucy will help you build your dataset."}
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={handleGetStarted}
          size="sm"
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {datasetObjective ? "Generate with Lucy" : "Get Started"}
        </Button>
      </div>
    </div>
  );
}
