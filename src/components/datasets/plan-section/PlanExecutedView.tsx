/**
 * PlanExecutedView
 *
 * Read-only view of a successfully executed setup plan.
 * Shows the plan markdown with a success badge and clear button.
 */

import { cn } from "@/lib/utils";
import { planToMarkdown } from "./SetupPlanEditor";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import type { SetupPlan } from "@/lib/distri-finetune-tools/steps/propose-setup-plan";

interface PlanExecutedViewProps {
  plan: SetupPlan;
  onClear: () => void;
  className?: string;
}

export function PlanExecutedView({
  plan,
  onClear,
  className,
}: PlanExecutedViewProps) {
  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
      {/* Header with completed badge */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-emerald-500/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Plan Executed Successfully
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
      {/* Read-only plan markdown */}
      <div className="flex-1 overflow-auto p-4 text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
        <LazyMarkdownRenderer content={planToMarkdown(plan)} />
      </div>
    </div>
  );
}
