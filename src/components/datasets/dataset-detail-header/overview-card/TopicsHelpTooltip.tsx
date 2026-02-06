/**
 * TopicsHelpTooltip
 *
 * Help tooltip that explains topic distribution and categorization.
 * Shows different content based on whether records are categorized or not.
 */

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TopicsHelpTooltipProps {
  /** Whether any records have been categorized */
  hasCategorizedRecords: boolean;
}

export function TopicsHelpTooltip({ hasCategorizedRecords }: TopicsHelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[300px]">
          <div className="text-xs space-y-2">
            {!hasCategorizedRecords ? (
              <>
                <p className="font-semibold">Why Categorize Records?</p>
                <p className="text-muted-foreground">
                  Assigning topics to your records helps ensure your model learns evenly
                  across all use cases, preventing it from being biased toward common scenarios.
                </p>
                <div className="border-t border-zinc-700 pt-2">
                  <p className="font-medium text-foreground">Benefits of Topic Distribution</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                    <li>• Identify gaps in training data coverage</li>
                    <li>• Ensure balanced representation across categories</li>
                    <li>• Generate targeted synthetic data for weak areas</li>
                    <li>• Track quality metrics per topic</li>
                  </ul>
                </div>
                <p className="text-amber-400 text-[10px]">
                  Use the AI assistant to auto-categorize your records.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Topic Distribution</p>
                <p className="text-muted-foreground">
                  The bar shows how your training data is distributed across topics.
                  Each color represents a different topic category.
                </p>
                <div className="border-t border-zinc-700 pt-2">
                  <p className="font-medium text-foreground">Balance Rating</p>
                  <p className="text-muted-foreground">
                    Measures how evenly records are spread across topics.
                    Higher balance = more consistent model performance.
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[10px]">
                    <li><span className="text-emerald-400">Excellent/Good:</span> Well-distributed, ready for training</li>
                    <li><span className="text-amber-400">Fair:</span> Some topics may be under-represented</li>
                    <li><span className="text-red-400">Poor/Critical:</span> Imbalanced, consider adding more data</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
