/**
 * DatasetUtilityBar
 *
 * Utility bar with export button and view mode toggle for the dataset detail view.
 */

import { LayoutGrid, Table2, Download, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ViewMode = "canvas" | "table";

export interface DatasetUtilityBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport?: () => void;
  onConfigureEvaluation?: () => void;
}

export function DatasetUtilityBar({ viewMode, onViewModeChange, onExport, onConfigureEvaluation }: DatasetUtilityBarProps) {
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

        {/* Configure Evaluation button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5"
                onClick={onConfigureEvaluation}
              >
                <FlaskConical className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configure evaluation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
        <Button
          variant={viewMode === "canvas" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => onViewModeChange("canvas")}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={viewMode === "table" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => onViewModeChange("table")}
        >
          <Table2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
