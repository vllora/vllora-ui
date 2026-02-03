/**
 * ViewModeToggle
 *
 * Toggle buttons for switching between dataset view modes (canvas, table, evaluator).
 */

import { LayoutGrid, Table2, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ViewMode = "canvas" | "table" | "evaluator";

interface ViewModeOption {
  mode: ViewMode;
  icon: React.ReactNode;
  tooltip: string;
}

const VIEW_MODE_OPTIONS: ViewModeOption[] = [
  {
    mode: "canvas",
    icon: <LayoutGrid className="w-3.5 h-3.5" />,
    tooltip: "Topic canvas",
  },
  {
    mode: "table",
    icon: <Table2 className="w-3.5 h-3.5" />,
    tooltip: "Records table",
  },
  {
    mode: "evaluator",
    icon: <Code2 className="w-3.5 h-3.5" />,
    tooltip: "Evaluator script",
  },
];

export interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({
  viewMode,
  onViewModeChange,
}: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
      {VIEW_MODE_OPTIONS.map((option) => (
        <TooltipProvider key={option.mode} delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === option.mode ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 gap-1.5"
                onClick={() => onViewModeChange(option.mode)}
              >
                {option.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{option.tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
}
