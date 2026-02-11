/**
 * PlanLoadingState
 *
 * Loading state shown when Lucy is generating a setup plan.
 */

import { cn } from "@/lib/utils";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

interface PlanLoadingStateProps {
  className?: string;
}

export function PlanLoadingState({ className }: PlanLoadingStateProps) {
  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <LoadingIndicator
        variant="progress"
        message="Creating your setup plan"
        submessage="Analyzing your documents and creating a setup plan..."
      />
    </div>
  );
}
