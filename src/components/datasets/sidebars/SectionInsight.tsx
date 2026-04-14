/**
 * SectionInsight
 *
 * Compact insight line displayed under sidebar section headers.
 * Shows the agent's analysis summary with status color coding.
 * Expandable to show full assessment + blockers + next action.
 *
 * Data comes from PipelineAnalysisContext (shared analysis between agent and UI).
 */

import { useState } from "react";
import { ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionAnalysis } from "@/types/pipeline-analysis-types";

interface SectionInsightProps {
  readonly analysis: SectionAnalysis;
}

const STATUS_COLORS: Record<string, string> = {
  "ready": "text-emerald-500",
  "in-progress": "text-blue-400",
  "needs-work": "text-amber-500",
  "blocked": "text-red-500",
  "not-started": "text-zinc-500",
};

export function SectionInsight({ analysis }: SectionInsightProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = analysis.assessment || analysis.blockers.length > 0 || analysis.nextAction;

  return (
    <div className="px-4 pb-2">
      {/* Compact summary line */}
      <button
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        className={cn(
          "w-full text-left flex items-start gap-1.5 group",
          hasDetails && "cursor-pointer",
          !hasDetails && "cursor-default",
        )}
      >
        {hasDetails && (
          <span className="text-muted-foreground/40 mt-0.5 shrink-0">
            {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </span>
        )}
        <p className={cn(
          "text-[11px] leading-relaxed",
          STATUS_COLORS[analysis.status] ?? "text-muted-foreground",
        )}>
          {analysis.summary}
        </p>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-1.5 ml-4 space-y-1.5 text-[11px] text-muted-foreground/70 border-l border-border/30 pl-2.5">
          {analysis.assessment && (
            <p className="leading-relaxed">{analysis.assessment}</p>
          )}
          {analysis.blockers.length > 0 && (
            <div className="flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-500/80">{analysis.blockers.join(". ")}</p>
            </div>
          )}
          {analysis.nextAction && (
            <p className="text-emerald-500/70">Next: {analysis.nextAction}</p>
          )}
        </div>
      )}
    </div>
  );
}
