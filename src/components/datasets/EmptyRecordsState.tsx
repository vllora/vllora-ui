/**
 * EmptyRecordsState
 *
 * Empty state component shown when a dataset has no records.
 * Shows workflow overview with getting-started guidance.
 * Also handles data generation progress display.
 */

import { useEffect, useState } from "react";
import { Database, FlaskConical, Sparkles, Loader2, Upload, FileUp, FileText } from "lucide-react";
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
  onImportClick?: () => void;
  onDocsClick?: () => void;
  docsProcessing?: boolean;
  docsProcessingCount?: number;
  docsTotal?: number;
}

export function EmptyRecordsState({
  datasetId,
  datasetObjective,
  onImportClick,
  onDocsClick,
  docsProcessing,
  docsProcessingCount = 0,
  docsTotal = 0,
}: EmptyRecordsStateProps) {
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

  const handleAskLucy = () => {
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgba(var(--theme-500),0.2)] to-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[rgb(var(--theme-500))] animate-spin" />
          </div>
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

  // When docs are processing, show a dedicated processing state
  // instead of the default "Get started" empty state
  if (docsProcessing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center">
            <FileText className="w-8 h-8 text-[rgb(var(--theme-500))]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium text-foreground">
              Processing reference documents
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {docsProcessingCount} of {docsTotal} document{docsTotal !== 1 ? "s" : ""} still processing.
              Training data will be generated from these documents once extraction is complete.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[rgb(var(--theme-500))]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Extracting content...</span>
          </div>
          {onDocsClick && (
            <Button variant="outline" size="sm" onClick={onDocsClick} className="gap-2">
              <FileText className="w-4 h-4" />
              View Reference Docs
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Title */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            Get started with your dataset
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {datasetObjective
              ? "Your dataset is ready. Follow these three stages to fine-tune your model."
              : "Define your training goal and follow three stages to fine-tune your model."}
          </p>
        </div>

        {/* 3-stage pipeline overview */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-[rgba(var(--theme-500),0.12)] flex items-center justify-center">
              <Database className="w-4.5 h-4.5 text-[rgb(var(--theme-500))]" />
            </div>
            <span className="text-xs font-medium">Data</span>
          </div>
          <span className="text-border mt-[-16px]">→</span>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <FlaskConical className="w-4.5 h-4.5 text-muted-foreground" />
            </div>
            <span className="text-xs font-medium">Evaluation</span>
          </div>
          <span className="text-border mt-[-16px]">→</span>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-muted-foreground" />
            </div>
            <span className="text-xs font-medium">Fine-tune</span>
          </div>
        </div>

        {/* Primary CTAs */}
        <div className="flex items-center gap-2">
          {onDocsClick && (
            <Button
              onClick={onDocsClick}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Documents
            </Button>
          )}
          <Button
            onClick={handleAskLucy}
            size="sm"
            className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask Lucy to Get Started
          </Button>
        </div>

        {/* Secondary link */}
        {onImportClick && (
          <button
            onClick={onImportClick}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileUp className="w-3 h-3" />
            Or import existing data
          </button>
        )}
      </div>
    </div>
  );
}
