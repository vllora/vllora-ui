/**
 * DatasetActions
 *
 * Action buttons for dataset operations: Export, Import, Evaluation Config, and Finetune.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Upload, Sparkles, Loader2, ListTree, AlertCircle, Scale, ShieldCheck, FlaskConical } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { EvaluationConfigDialog } from "./evaluation-dialog/EvaluationConfigDialog";
import type { EvaluationConfig } from "@/types/dataset-types";

export function DatasetActions() {
  const {
    dataset,
    handleExport,
    setImportDialog,
    setTopicHierarchyDialog,
    setSanitizeDataDialog,
    setDryRunDialog,
    handleStartFinetune,
    isStartingFinetune,
  } = DatasetDetailConsumer();

  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);

  // Check if topic hierarchy is configured
  const hasTopicHierarchy = dataset?.topicHierarchy?.hierarchy && dataset.topicHierarchy.hierarchy.length > 0;

  // Check if evaluation config exists
  const hasEvaluationConfig = !!dataset?.evaluationConfig;

  const handleSaveEvaluationConfig = async (config: EvaluationConfig) => {
    // TODO: Save evaluation config to dataset
    console.log("Saving evaluation config:", config);
  };

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setSanitizeDataDialog(true)}
            >
              <ShieldCheck className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sanitize data</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground relative"
              onClick={() => setEvaluationDialogOpen(true)}
            >
              <Scale className="w-4 h-4" />
              {!hasEvaluationConfig && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <AlertCircle className="relative h-3 w-3 text-amber-500" />
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasEvaluationConfig ? "Configure evaluation" : "Configure evaluation (not set)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setDryRunDialog(true)}
            >
              <FlaskConical className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Dry run validation</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleExport}
            >
              <Download className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export dataset</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setImportDialog(true)}
            >
              <Upload className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import data</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className="h-8 px-4 rounded-full bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white shadow-sm disabled:opacity-50"
              onClick={handleStartFinetune}
              disabled={isStartingFinetune}
            >
              {isStartingFinetune ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Start fine-tuning job</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Evaluation Config Dialog */}
      <EvaluationConfigDialog
        open={evaluationDialogOpen}
        onOpenChange={setEvaluationDialogOpen}
        config={dataset?.evaluationConfig}
        onSave={handleSaveEvaluationConfig}
      />
    </div>
  );
}
