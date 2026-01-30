/**
 * ViewRecordsButton
 *
 * Icon button to view/expand records for a topic node.
 * Shows tooltip on hover.
 */

import { Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ViewRecordsButtonProps {
  onViewRecords: () => void;
}

export function ViewRecordsButton({ onViewRecords }: ViewRecordsButtonProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onViewRecords();
            }}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-[rgb(var(--theme-500))]/15 transition-all cursor-pointer nodrag text-muted-foreground hover:text-[rgb(var(--theme-500))] border-transparent"
            style={{ pointerEvents: 'auto' }}
          >
            <Eye className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">View records</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
