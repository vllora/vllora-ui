/**
 * PlanEmptyState
 *
 * Empty state shown when no setup plan is active.
 * Prompts the user to generate a setup plan via Lucy.
 */

import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";
import { EmptyStateTemplate } from "../EmptyStateTemplate";

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
    <EmptyStateTemplate
      icon={Wand2}
      heading="Setup Plan"
      description="Let Lucy analyze your dataset and create a customized setup plan. She'll suggest topics, generate training data, and configure evaluation."
      action={
        <Button
          onClick={handleGeneratePlan}
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <Sparkles className="w-4 h-4" />
          Generate Setup Plan
        </Button>
      }
      helperText="You can also ask Lucy directly in the chat to create a plan"
      className={className}
    />
  );
}
