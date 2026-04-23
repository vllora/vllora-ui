/**
 * EvaluatorVersionBadge
 *
 * Shared badge showing which evaluator version a job used.
 * Shows a staleness warning when the grader has been updated since the job ran.
 */

import { Code2, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EvaluatorVersionBadgeProps {
  /** The evaluator version this job used */
  readonly jobVersion: number;
  /** The latest available evaluator version */
  readonly latestVersion: number;
  /** Optional className */
  readonly className?: string;
}

export function EvaluatorVersionBadge({
  jobVersion,
  latestVersion,
  className,
}: EvaluatorVersionBadgeProps) {
  const isStale = jobVersion < latestVersion;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-default",
              isStale
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-zinc-800 text-zinc-400 border-zinc-700/50",
              className,
            )}
          >
            <Code2 className="h-2.5 w-2.5" />
            v{jobVersion}
            {isStale && <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px] max-w-[240px]">
          {isStale
            ? `Grader updated to v${latestVersion} since this job used v${jobVersion}`
            : `Using evaluator v${jobVersion} (latest)`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
