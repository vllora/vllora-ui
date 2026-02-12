/**
 * PlanEmptyState
 *
 * Empty state shown when no setup plan is active.
 * Prompts the user to generate a setup plan via Lucy.
 * Shows loading state after click with timeout feedback if Lucy doesn't respond.
 */

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Wand2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";
import { EmptyStateTemplate } from "../EmptyStateTemplate";

interface PlanEmptyStateProps {
  className?: string;
}

export function PlanEmptyState({ className }: PlanEmptyStateProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  const handleGeneratePlan = useCallback(() => {
    setIsRequesting(true);
    setHasTimedOut(false);
    emitter.emit("vllora_lucy_prompt", {
      prompt: `Please analyze my dataset and create a setup plan using the propose_setup_plan tool.`,
    });
  }, []);

  // Listen for plan generation starting (means Lucy received the prompt)
  // If no response after 10s, show timeout feedback with retry
  useEffect(() => {
    if (!isRequesting) return;

    const handleGenerating = () => {
      // Lucy picked up the prompt — PlanSection parent will switch to PlanLoadingState
      setIsRequesting(false);
      setHasTimedOut(false);
    };

    const timeoutId = setTimeout(() => {
      setIsRequesting(false);
      setHasTimedOut(true);
    }, 10000);

    emitter.on("vllora_setup_plan_generating", handleGenerating);
    return () => {
      emitter.off("vllora_setup_plan_generating", handleGenerating);
      clearTimeout(timeoutId);
    };
  }, [isRequesting]);

  return (
    <EmptyStateTemplate
      icon={Wand2}
      heading="Setup Plan"
      description="Let Lucy analyze your dataset and create a customized setup plan. She'll suggest topics, generate training data, and configure evaluation."
      action={
        <div className="flex flex-col items-center gap-3">
          {hasTimedOut && (
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <AlertCircle className="w-4 h-4" />
              <span>Lucy doesn't seem to be responding. Check that the agent is connected.</span>
            </div>
          )}
          <Button
            onClick={handleGeneratePlan}
            disabled={isRequesting}
            className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            {isRequesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for Lucy...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {hasTimedOut ? "Retry Generate Plan" : "Generate Setup Plan"}
              </>
            )}
          </Button>
        </div>
      }
      helperText="You can also ask Lucy directly in the chat to create a plan"
      className={className}
    />
  );
}
