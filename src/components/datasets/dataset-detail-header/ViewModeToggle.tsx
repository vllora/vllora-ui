/**
 * ViewModeToggle
 *
 * Toggle buttons for switching between record view modes (canvas, sources, table).
 * Note: Evaluator is now a separate section accessed via DatasetSectionTabs.
 */

import { LayoutGrid, Table2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ViewMode = "canvas" | "sources" | "table";

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
    mode: "sources",
    icon: <FileText className="w-3.5 h-3.5" />,
    tooltip: "Knowledge sources",
  },
  {
    mode: "table",
    icon: <Table2 className="w-3.5 h-3.5" />,
    tooltip: "Records table",
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
