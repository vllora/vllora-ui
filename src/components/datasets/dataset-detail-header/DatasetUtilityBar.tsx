/**
 * DatasetUtilityBar
 *
 * Combined utility bar with section tabs on the left and context-sensitive actions on the right.
 * - Records section: Export, Finetune, Jobs buttons + Canvas/Table toggle
 * - Evaluator section: No additional actions (panel has its own controls)
 */

import { Download, ListChecks, Database, RotateCcw, Copy, Check, FlaskConical } from "lucide-react";
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
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";

export type { ViewMode };

export type DatasetSection = "records" | "evaluator" | "jobs";

export interface DatasetUtilityBarProps {
  /** Current active section */
  activeSection: DatasetSection;
  /** Callback when section changes */
  onSectionChange: (section: DatasetSection) => void;
  /** Current view mode within records section */
  viewMode: ViewMode;
  /** Callback when view mode changes */
  onViewModeChange: (mode: ViewMode) => void;
  /** Callback for export action */
  onExport?: () => void;
  /** Whether the dataset has records */
  hasRecords?: boolean;
  /** Whether the dataset has an evaluation function configured */
  hasEvaluator?: boolean;
  /** Callback when finetune button is clicked */
  onFinetune?: () => void;
  /** Whether finetune is in progress */
  isFinetuning?: boolean;
  /** Callback for evaluator reset action */
  onEvaluatorReset?: () => void;
  /** Callback for evaluator copy action */
  onEvaluatorCopy?: () => void;
}

const SECTION_TABS = [
  {
    id: "records" as const,
    label: "Records",
    icon: Database,
  },
  {
    id: "evaluator" as const,
    label: "Evaluator",
    icon: FlaskConical,
  },
  {
    id: "jobs" as const,
    label: "Jobs",
    icon: ListChecks,
  },
];

export function DatasetUtilityBar({
  activeSection,
  onSectionChange,
  viewMode,
  onViewModeChange,
  onExport,
  hasRecords,
  hasEvaluator,
  onFinetune,
  isFinetuning,
  onEvaluatorReset,
  onEvaluatorCopy,
}: DatasetUtilityBarProps) {
  const canFinetune = hasRecords && hasEvaluator;
  const { filteredJobs } = useFinetuneJobs();

  // Count active jobs (pending or running)
  const activeJobsCount = filteredJobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  ).length;

  const isRecordsSection = activeSection === "records";

  return (
    <div className="px-4 py-1.5 border-b border-border flex items-center justify-between">
      {/* Left side: Section tabs */}
      <div className="flex items-center">
        {SECTION_TABS.map((tab) => {
          const isActive = activeSection === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onSectionChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors rounded-md relative",
                "hover:bg-muted/50",
                isActive
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {/* Configured indicator for evaluator */}
              {tab.id === "evaluator" && hasEvaluator && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    </TooltipTrigger>
                    <TooltipContent>Evaluator is configured</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Active jobs count badge for jobs tab */}
              {tab.id === "jobs" && activeJobsCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[rgb(var(--theme-500))] text-[10px] font-medium text-white">
                  {activeJobsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right side: Context-sensitive actions */}
      <div className="flex items-center gap-2">
        {/* Records section actions */}
        {isRecordsSection && (
          <>
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

            {/* View mode toggle */}
            <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          </>
        )}

        {/* Evaluator section actions */}
        {activeSection === "evaluator" && (
          <>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 gap-1.5 text-xs"
                    onClick={onEvaluatorReset}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to default evaluator</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 gap-1.5 text-xs"
                    onClick={onEvaluatorCopy}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy evaluator code</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        {/* Finetune button - always visible in all tabs */}
        <FinetuneButton
          onFinetune={onFinetune}
          isFinetuning={isFinetuning}
          disabled={!canFinetune || activeJobsCount > 0}
          tooltipText={
            !hasRecords
              ? "Add records to the dataset first"
              : !hasEvaluator
                ? "Configure an evaluator function in the Evaluator tab"
                : activeJobsCount > 0
                  ? "A finetune job is already running. View progress in the Jobs tab."
                  : "Start finetune workflow"
          }
        />
      </div>
    </div>
  );
}
