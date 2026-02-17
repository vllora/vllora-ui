/**
 * DatasetDetailHeader
 *
 * Header showing dataset title, objective, and action buttons for Readme/Docs drawers.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { FileText, FolderOpen, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { SetupPlanConsumer } from "@/contexts/SetupPlanContext";
import { EditableTitle } from "./EditableTitle";

interface DatasetDetailHeaderProps {
  onOpenReadme?: () => void;
  onOpenDocs?: () => void;
  onOpenPlan?: () => void;
  knowledgeSourcesCount?: number;
  docsProcessing?: boolean;
}

export function DatasetDetailHeader({
  onOpenReadme,
  onOpenDocs,
  onOpenPlan,
  knowledgeSourcesCount = 0,
  docsProcessing = false,
}: DatasetDetailHeaderProps) {
  const { dataset, handleRenameDataset } = DatasetDetailConsumer();
  const { hasPlanProposed, isGeneratingPlan, isPlanPreviewActive } = SetupPlanConsumer();

  return (
    <div className="w-full flex flex-col">
      {/* Title row with action buttons */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <EditableTitle
            value={dataset?.name ?? ""}
            onSave={handleRenameDataset}
          />
        </div>

        {/* Header action buttons */}
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenPlan && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isPlanPreviewActive ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={onOpenPlan}
                  >
                    {isGeneratingPlan ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--theme-500))]" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span className="text-xs">Flow</span>
                    {hasPlanProposed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--theme-500))]" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isGeneratingPlan
                    ? "Generating flow..."
                    : hasPlanProposed
                      ? "View flow"
                      : "Flow"}
                </TooltipContent>
              </Tooltip>
            )}

            {onOpenReadme && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={onOpenReadme}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">Readme</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View dataset README</TooltipContent>
              </Tooltip>
            )}

            {onOpenDocs && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={onOpenDocs}
                  >
                    {docsProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                    <span className="text-xs">Docs</span>
                    {knowledgeSourcesCount > 0 && (
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
                        {knowledgeSourcesCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {docsProcessing ? "Processing documents..." : "View reference documents"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Objective */}
      {dataset?.datasetObjective && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Objective:</span>{" "}
          {dataset.datasetObjective}
        </p>
      )}
    </div>
  );
}
