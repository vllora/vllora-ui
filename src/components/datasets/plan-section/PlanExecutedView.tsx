/**
 * PlanExecutedView
 *
 * Read-only view of a successfully executed setup plan.
 * Shows the plan markdown with a success badge.
 * "Clear" collapses to a single-line summary; "Show plan" re-expands.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className={cn("flex-shrink-0", className)}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-[rgba(var(--theme-500),0.05)]">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-2 text-xs font-medium text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))] hover:underline"
          >
            <ChevronRight className="w-3 h-3" />
            <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))]" />
            Plan Executed Successfully
          </button>
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
      {/* Header with completed badge */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-[rgba(var(--theme-500),0.05)]">
        <button
          onClick={() => setIsCollapsed(true)}
          className="flex items-center gap-2 text-xs font-medium text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))] hover:underline"
        >
          <ChevronDown className="w-3 h-3" />
          <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))]" />
          Plan Executed Successfully
        </button>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Dismiss
        </button>
      </div>
      {/* Read-only plan markdown */}
      <div className="flex-1 overflow-auto p-4 text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
        <LazyMarkdownRenderer content={planToMarkdown(plan)} />
      </div>
    </div>
  );
}
