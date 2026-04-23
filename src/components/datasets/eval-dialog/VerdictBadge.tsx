/**
 * VerdictBadge
 *
 * Badge displaying the evaluation verdict (GO, WARNING, NO-GO)
 * with a tooltip explaining what the verdict means.
 */

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VerdictBadgeProps {
  verdict: string;
}

const VERDICT_DESCRIPTIONS: Record<string, string> = {
  GO: "Ready for training — dataset and evaluator quality are good. You can proceed to start a training job.",
  WARNING: "Proceed with caution — there are some issues to review. Check the recommendations below before starting training.",
  "NO-GO": "Not ready for training — there are critical issues with the evaluation results. Address them before proceeding (e.g., low scores, high failure rate, or poor evaluator differentiation).",
};

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const description = VERDICT_DESCRIPTIONS[verdict] ?? `Evaluation verdict: ${verdict}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-semibold border cursor-help",
              verdict === "GO"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : verdict === "NO-GO"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            )}
          >
            {verdict}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px]">
          <p className="text-[11px]">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
