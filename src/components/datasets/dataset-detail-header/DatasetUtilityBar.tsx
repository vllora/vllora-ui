/**
 * DatasetUtilityBar
 *
 * Utility bar with export button, view mode toggle, and finetune button for the dataset detail view.
 */

import { LayoutGrid, Table2, Download, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FinetuneButton } from "@/components/datasets/FinetuneButton";

export type ViewMode = "canvas" | "table" | "evaluator";

export interface DatasetUtilityBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport?: () => void;
  /** Whether the dataset has records */
  hasRecords?: boolean;
  /** Whether the dataset has an evaluation function configured */
  hasEvaluator?: boolean;
  /** Callback when finetune button is clicked */
  onFinetune?: () => void;
  /** Whether finetune is in progress */
  isFinetuning?: boolean;
}

export function DatasetUtilityBar({
  viewMode,
  onViewModeChange,
  onExport,
  hasRecords,
  hasEvaluator,
  onFinetune,
  isFinetuning,
}: DatasetUtilityBarProps) {
  const canFinetune = hasRecords && hasEvaluator;

  return (
    <div className="px-4 py-2 border-b border-border flex items-center justify-between">
      <div className="flex items-center gap-2">
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

        {/* Finetune button - shown when records and evaluator exist */}
        {canFinetune && (
          <FinetuneButton
            onFinetune={onFinetune}
            isFinetuning={isFinetuning}
            tooltipText="Start finetune workflow"
          />
        )}
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
