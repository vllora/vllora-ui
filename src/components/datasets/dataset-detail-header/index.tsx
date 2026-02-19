/**
 * DatasetDetailHeader
 *
 * Header showing dataset title, objective, and action buttons for Readme/Docs drawers.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState } from "react";
import { FileText, FolderOpen, Loader2, Sparkles, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { PlanConsumer } from "@/contexts/PlanContext";
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
  const { dataset, handleRenameDataset, handleUpdateObjective } = DatasetDetailConsumer();
  const { hasPlanProposed, isGeneratingPlan, isPlanPreviewActive } = PlanConsumer();
  const [isEditingObjective, setIsEditingObjective] = useState(false);
  const [objectiveValue, setObjectiveValue] = useState("");

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
                    <span className="text-xs">Plan</span>
                    {hasPlanProposed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--theme-500))]" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isGeneratingPlan
                    ? "Generating plan..."
                    : hasPlanProposed
                      ? "View plan"
                      : "Plan"}
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
      {isEditingObjective ? (
        <div className="flex items-center gap-2">
          <Input
            value={objectiveValue}
            onChange={(e) => setObjectiveValue(e.target.value)}
            className="h-7 text-sm flex-1"
            placeholder="Describe the training objective..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleUpdateObjective(objectiveValue);
                setIsEditingObjective(false);
              }
              if (e.key === "Escape") setIsEditingObjective(false);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              handleUpdateObjective(objectiveValue);
              setIsEditingObjective(false);
            }}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setIsEditingObjective(false)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Objective:</span>{" "}
            {dataset?.datasetObjective || (
              <span className="italic text-muted-foreground/60">Not set</span>
            )}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => {
              setObjectiveValue(dataset?.datasetObjective ?? "");
              setIsEditingObjective(true);
            }}
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
