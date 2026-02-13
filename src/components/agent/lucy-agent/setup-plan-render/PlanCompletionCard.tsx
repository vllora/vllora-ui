/**
 * PlanCompletionCard
 *
 * Shown in sidebar chat when plan execution finishes.
 * Displays summary stats and navigation buttons.
 */

import { CheckCircle2, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-setup-plan";

interface PlanCompletionCardProps {
  progress: ExecutionProgress;
  datasetId: string;
}

export function PlanCompletionCard({ progress, datasetId }: PlanCompletionCardProps) {
  // Extract summary from completed steps
  const completedSteps = progress.steps.filter(s => s.status === "completed");
  const failedSteps = progress.steps.filter(s => s.status === "failed");

  const handleViewData = () => {
    emitter.emit("vllora_switch_tab", { datasetId, tab: "records" });
  };

  const handleCheckJob = () => {
    emitter.emit("vllora_switch_tab", { datasetId, tab: "jobs" });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[rgb(var(--theme-500))]" />
        <span className="text-xs font-semibold text-foreground">
          {failedSteps.length > 0 ? "Setup partially complete" : "Setup complete!"}
        </span>
      </div>

      {/* Completed steps summary */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {completedSteps.map((step) => (
          <div key={step.name} className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-[rgb(var(--theme-500))] shrink-0" />
            <span>{step.name}</span>
          </div>
        ))}
        {failedSteps.map((step) => (
          <div key={step.name} className="flex items-center gap-1.5 text-destructive">
            <span className="w-3 h-3 text-center shrink-0">!</span>
            <span>{step.name} (failed)</span>
          </div>
        ))}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1 flex-1"
          onClick={handleViewData}
        >
          <Database className="w-3 h-3" />
          View Data
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1 flex-1"
          onClick={handleCheckJob}
        >
          <Sparkles className="w-3 h-3" />
          Check Job
        </Button>
      </div>
    </div>
  );
}
