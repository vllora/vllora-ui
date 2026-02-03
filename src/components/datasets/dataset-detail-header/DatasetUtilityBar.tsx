/**
 * DatasetUtilityBar
 *
 * Utility bar with export button, view mode toggle, and finetune button for the dataset detail view.
 */

import { LayoutGrid, Table2, Download, Code2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FinetuneButton } from "@/components/datasets/FinetuneButton";
import { useFinetuneJobs } from "@/contexts/FinetuneJobsContext";
import { cn } from "@/lib/utils";

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
  const { filteredJobs, isSidebarOpen, setIsSidebarOpen } = useFinetuneJobs();

  // Count active jobs (pending or running)
  const activeJobsCount = filteredJobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  ).length;

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
            disabled={activeJobsCount > 0}
            tooltipText={
              activeJobsCount > 0
                ? `A finetune job is already running. View progress in the Jobs panel.`
                : "Start finetune workflow"
            }
          />
        )}

        {/* View jobs button - shown when there are jobs for this dataset */}
        {filteredJobs.length > 0 && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isSidebarOpen ? "secondary" : "outline"}
                  size="sm"
                  className={cn(
                    "h-7 px-2.5 gap-1.5 relative",
                    isSidebarOpen && "bg-[rgb(var(--theme-500))]/10 border-[rgb(var(--theme-500))]/30"
                  )}
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span className="text-xs">Jobs</span>
                  {activeJobsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[rgb(var(--theme-500))] text-[10px] font-medium text-white">
                      {activeJobsCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isSidebarOpen ? "Hide finetune jobs" : `View finetune jobs (${filteredJobs.length})`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
