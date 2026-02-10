/**
 * DatasetDetailHeader
 *
 * Simplified header showing dataset objective and key statistics in cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { EditableTitle } from "./EditableTitle";
import type { DatasetSection } from "./DatasetUtilityBar";

interface StepItem {
  id: DatasetSection;
  label: string;
  isComplete: boolean;
  tooltip: string;
}

export function DatasetDetailHeader() {
  const {
    dataset,
    sortedRecords,
    handleRenameDataset,
    setActiveSection,
  } = DatasetDetailConsumer();

  const { filteredJobs } = FinetuneJobsConsumer();

  const hasEvaluator = !!dataset?.evalScript;

  const recordsCount = sortedRecords.length;
  const jobsCount = filteredJobs.length;

  const steps: StepItem[] = [
    {
      id: "records",
      label: "Training data",
      isComplete: recordsCount > 0,
      tooltip: recordsCount > 0
        ? `✓ ${recordsCount} training record${recordsCount !== 1 ? "s" : ""} added`
        : "Upload or generate training examples for your model",
    },
    {
      id: "evaluator",
      label: "Quality scoring",
      isComplete: hasEvaluator,
      tooltip: hasEvaluator
        ? "✓ Quality grader configured"
        : "Set up a grader to score your model's outputs",
    },
    {
      id: "jobs",
      label: "Fine-tune",
      isComplete: jobsCount > 0,
      tooltip: jobsCount > 0
        ? `✓ ${jobsCount} training job${jobsCount !== 1 ? "s" : ""} created`
        : "Start a fine-tuning job once data and scoring are ready",
    },
  ];

  const allComplete = steps.every((s) => s.isComplete);

  return (
    <div className="w-full flex flex-col">
      {/* Title Row + Workflow Checklist */}
      <div className="flex items-center gap-4 mb-3">
        <EditableTitle
          value={dataset?.name ?? ""}
          onSave={handleRenameDataset}
        />

        {/* Inline workflow checklist — hides when all done */}
        {!allComplete && (
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-3 shrink-0 ml-auto">
              {steps.map((step) => (
                <Tooltip key={step.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveSection(step.id)}
                      className={cn(
                        "flex items-center gap-1 text-xs transition-colors",
                        step.isComplete
                          ? "text-[rgb(var(--theme-500))]"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {step.isComplete ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Circle className="w-3 h-3" />
                      )}
                      <span className={step.isComplete ? "line-through opacity-60" : ""}>
                        {step.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[260px]">
                    {step.tooltip}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Objective */}
      {dataset?.datasetObjective && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Objective:</span>{" "}
          {dataset.datasetObjective}
        </p>
      )}
    </div>
  );
}
