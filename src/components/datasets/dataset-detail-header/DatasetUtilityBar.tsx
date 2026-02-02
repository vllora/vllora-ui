/**
 * DatasetUtilityBar
 *
 * Utility bar with export button and view mode toggle for the dataset detail view.
 */

import { LayoutGrid, Table2, Download, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ViewMode = "canvas" | "table" | "evaluator";

export interface DatasetUtilityBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport?: () => void;
}

export function DatasetUtilityBar({ viewMode, onViewModeChange, onExport }: DatasetUtilityBarProps) {
  return (
    <div className="px-4 py-2 border-b border-border flex items-center justify-between">
      <div className="flex items-center gap-1">
        {/* Export button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5"
                onClick={onExport}
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export dataset</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "canvas" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 gap-1.5"
                onClick={() => onViewModeChange("canvas")}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Topic canvas</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 gap-1.5"
                onClick={() => onViewModeChange("table")}
              >
                <Table2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Records table</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "evaluator" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 gap-1.5"
                onClick={() => onViewModeChange("evaluator")}
              >
                <Code2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Evaluator script</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
