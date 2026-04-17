/**
 * EmptyRecordsState
 *
 * Empty state component shown when a dataset has no records.
 * Shows workflow overview with getting-started guidance.
 * Also handles data generation progress display.
 */

import { useEffect, useState } from "react";
import { Database, FlaskConical, Sparkles, Loader2, Upload, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { KnowledgeSourceCard } from "./KnowledgeSourceCard";
import { IS_LUCY_ENABLED } from "@/lib/feature-flags";

interface GenerationProgress {
  status: "started" | "progress" | "completed" | "failed";
  total: number;
  completed: number;
  currentBatch?: number;
  totalBatches?: number;
  error?: string;
}

interface EmptyRecordsStateProps {
  workflowId: string;
  datasetObjective?: string;
  hasTopicHierarchy?: boolean;
  onImportClick?: () => void;
  onDocsClick?: () => void;
  docsProcessing?: boolean;
  docsProcessingCount?: number;
  docsTotal?: number;
}

export function EmptyRecordsState({
  workflowId,
  datasetObjective,
  hasTopicHierarchy = false,
  onImportClick,
  onDocsClick,
  docsProcessing,
  docsProcessingCount = 0,
  docsTotal = 0,
}: EmptyRecordsStateProps) {
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  // If the agent has uploaded sources but records haven't landed yet, the pipeline
  // is actively processing — suppress the "Upload Documents" CTA which would be
  // confusing (docs already exist, agent is working on them).
  const { sources } = KnowledgeSourcesConsumer();
  const pipelineActive = sources.length > 0;

  // Listen for generation progress events
  useEffect(() => {
    const handleProgress = (event: {
      workflowId: string;
      status: "started" | "progress" | "completed" | "failed";
      total: number;
      completed: number;
      currentBatch?: number;
      totalBatches?: number;
      error?: string;
    }) => {
      if (event.workflowId === workflowId) {
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
  }, [workflowId]);

  const handleAskLucy = () => {
    const prompt = hasTopicHierarchy
      ? "Generate training data to fill my topics."
      : datasetObjective
        ? "Help me generate training data for this workflow."
        : "Help me get started with this workflow.";
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

  // When docs are processing, show per-doc processing status
  // instead of the default "Get started" empty state
  if (docsProcessing) {
    return <DocsProcessingView docsProcessingCount={docsProcessingCount} docsTotal={docsTotal} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Title */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            {hasTopicHierarchy ? "Your topics are ready for data" : "Get started with your workflow"}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {hasTopicHierarchy
              ? "Generate training data to fill your topics, or import existing records."
              : datasetObjective
                ? "Your workflow is ready. Follow these three stages to fine-tune your model."
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

        {/* Primary CTAs — hide when pipeline is already active (sources exist). */}
        {!pipelineActive && (
          <div className="flex items-center gap-2">
            {onDocsClick && (
              <Button
                onClick={onDocsClick}
                size="sm"
                variant={IS_LUCY_ENABLED ? "outline" : "default"}
                className="gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Documents
              </Button>
            )}
            {IS_LUCY_ENABLED && (
              <Button
                onClick={handleAskLucy}
                size="sm"
                className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ask Lucy to Get Started
              </Button>
            )}
          </div>
        )}
        {pipelineActive && (
          <p className="text-xs text-muted-foreground">
            Pipeline is processing {sources.length} source{sources.length === 1 ? "" : "s"}. Records will appear as each step completes.
          </p>
        )}

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

/**
 * Sub-component for docs processing state.
 * Consumes KnowledgeSourcesContext directly to show per-doc cards.
 */
function DocsProcessingView({
  docsProcessingCount,
  docsTotal,
}: {
  docsProcessingCount: number;
  docsTotal: number;
}) {
  const { sources } = KnowledgeSourcesConsumer();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-5 w-full max-w-md text-center">
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            Processing reference documents
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {docsProcessingCount} of {docsTotal} document{docsTotal !== 1 ? "s" : ""} still processing.
            Lucy will create a plan once extraction is complete.
          </p>
        </div>

        {/* Per-doc processing cards */}
        <div className="w-full space-y-2">
          {sources.map((source) => (
            <KnowledgeSourceCard
              key={source.id}
              source={source}
              isExpanded={false}
              onToggleExpand={() => {}}
              onDelete={() => {}}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
