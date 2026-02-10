/**
 * PlanCompletedState
 *
 * Shows when a setup plan has been successfully executed.
 * Displays a summary and links to next steps.
 */

import { CheckCircle2, FileText, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";

interface PlanCompletedStateProps {
  className?: string;
  topicCount?: number;
  recordCount?: number;
  onNavigateToRecords?: () => void;
  onNavigateToReadme?: () => void;
}

export function PlanCompletedState({
  className,
  topicCount,
  recordCount,
  onNavigateToRecords,
  onNavigateToReadme,
}: PlanCompletedStateProps) {
  const handleGenerateNewPlan = () => {
    emitter.emit("vllora_lucy_prompt", {
      prompt: `Please analyze my dataset and create a new setup plan using the propose_setup_plan tool.`,
    });
  };

  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Success Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(var(--theme-500))]/15 to-[rgb(var(--theme-500))]/5 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-foreground">
            Setup Plan Completed
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your dataset has been configured and is ready for fine-tuning.
            {topicCount && recordCount && (
              <span className="block mt-1 text-foreground/80">
                Generated {recordCount} training records across {topicCount} topics.
              </span>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {onNavigateToRecords && (
            <Button
              variant="outline"
              onClick={onNavigateToRecords}
              className="gap-2"
            >
              <Database className="w-4 h-4" />
              View Records
            </Button>
          )}
          {onNavigateToReadme && (
            <Button
              variant="outline"
              onClick={onNavigateToReadme}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              View README
            </Button>
          )}
        </div>

        {/* Divider */}
        <div className="w-full border-t border-border my-2" />

        {/* Generate new plan option */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Want to create a different configuration?
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerateNewPlan}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate New Plan
          </Button>
        </div>
      </div>
    </div>
  );
}
