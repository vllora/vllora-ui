/**
 * PlanLoadingState
 *
 * Loading state shown when Lucy is generating a setup plan.
 */

import { cn } from "@/lib/utils";

interface PlanLoadingStateProps {
  className?: string;
}

export function PlanLoadingState({ className }: PlanLoadingStateProps) {
  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            Creating your setup plan
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Analyzing your documents and creating a setup plan...
          </p>
        </div>
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[rgb(var(--theme-500))] rounded-full"
            style={{
              animation: "plan-progress 2s ease-in-out infinite",
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes plan-progress {
          0% { width: 0%; }
          50% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </div>
  );
}
