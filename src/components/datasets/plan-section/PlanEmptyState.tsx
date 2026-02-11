/**
 * PlanEmptyState
 *
 * Empty state shown when no setup plan is active.
 * Prompts the user to generate a setup plan via Lucy.
 */

import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";

interface PlanEmptyStateProps {
  className?: string;
}

export function PlanEmptyState({ className }: PlanEmptyStateProps) {
  const handleGeneratePlan = () => {
    emitter.emit("vllora_lucy_prompt", {
      prompt: `Please analyze my dataset and create a setup plan using the propose_setup_plan tool.`,
    });
  };

  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgba(var(--theme-500),0.15)] to-[rgba(var(--theme-500),0.05)] flex items-center justify-center">
          <Wand2 className="w-6 h-6 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-foreground">
            Setup Plan
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Let Lucy analyze your dataset and create a customized setup plan.
            She'll suggest topics, generate training data, and configure evaluation.
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={handleGeneratePlan}
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <Sparkles className="w-4 h-4" />
          Generate Setup Plan
        </Button>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          You can also ask Lucy directly in the chat to create a plan
        </p>
      </div>
    </div>
  );
}
