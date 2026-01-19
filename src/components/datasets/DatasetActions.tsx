/**
 * DatasetActions
 *
 * Action buttons for dataset operations: Export, Import, and Finetune.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Upload, Sparkles, Loader2, ListTree } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";

export function DatasetActions() {
  const {
    handleExport,
    setImportDialog,
    setTopicHierarchyDialog,
    handleStartFinetune,
    isStartingFinetune,
  } = DatasetDetailConsumer();

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setTopicHierarchyDialog(true)}
            >
              <ListTree className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Configure topic hierarchy</TooltipContent>
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
    </div>
  );
}
