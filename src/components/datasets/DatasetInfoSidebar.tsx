/**
 * DatasetInfoSidebar
 *
 * Sidebar component for entering dataset metadata and creating the dataset.
 * Used in the dataset creation flow.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Database, Loader2, AlertCircle } from "lucide-react";

export interface DatasetInfoSidebarProps {
  datasetName: string;
  onDatasetNameChange: (name: string) => void;
  finetuneObjective: string;
  onFinetuneObjectiveChange: (objective: string) => void;
  selectionCount: number;
  isCreating: boolean;
  /** Optional status message to show during creation (e.g., "Fetching spans...") */
  creatingStatus?: string;
  onCreateDataset: () => void;
}

export function DatasetInfoSidebar({
  datasetName,
  onDatasetNameChange,
  finetuneObjective,
  onFinetuneObjectiveChange,
  selectionCount,
  isCreating,
  creatingStatus,
  onCreateDataset,
}: DatasetInfoSidebarProps) {
  // Determine why the button is disabled
  const disabledReason = useMemo(() => {
    if (isCreating) return null; // Not disabled, just loading
    if (!datasetName.trim()) return "Please enter a dataset name";
    if (selectionCount === 0) return "Please select at least one record";
    return null;
  }, [datasetName, selectionCount, isCreating]);

  const isDisabled = !!disabledReason || isCreating;

  const buttonContent = (
    <Button
      className="w-full gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white disabled:bg-muted disabled:text-muted-foreground"
      disabled={isDisabled}
      onClick={onCreateDataset}
    >
      {isCreating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {creatingStatus || "Creating..."}
        </>
      ) : disabledReason ? (
        <>
          <AlertCircle className="h-4 w-4" />
          Create Dataset
        </>
      ) : (
        <>
          <Database className="h-4 w-4" />
          Create Dataset
        </>
      )}
    </Button>
  );

  return (
    <div className="col-span-1 h-full flex flex-col min-h-0">
      <div className="border border-border rounded-lg bg-card flex flex-col h-full">
        <div className="p-6 pb-0">
          <h2 className="text-lg font-semibold mb-6">Dataset Info</h2>

          <div className="space-y-6">
            {/* Dataset Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Dataset Name
              </label>
              <Input
                placeholder="my-training-dataset"
                value={datasetName}
                onChange={(e) => onDatasetNameChange(e.target.value)}
              />
            </div>

            {/* Finetune Objective */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Training Objective
                <span className="text-muted-foreground font-normal ml-2">(Optional)</span>
              </label>
              <Textarea
                placeholder="Describe specific behaviors you want to reinforce or suppress..."
                value={finetuneObjective}
                onChange={(e) => onFinetuneObjectiveChange(e.target.value)}
                className="min-h-[120px] resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                This helps the optimizer refine the RFT model weights during training.
              </p>
            </div>
          </div>
        </div>

        {/* Spacer to push button to bottom */}
        <div className="flex-1" />

        {/* Selection summary and button at bottom */}
        <div className="p-6 pt-4 border-t border-border mt-auto">
          <div className="flex items-center justify-between text-sm mb-4">
            <span className="text-muted-foreground">Selected records</span>
            <span className="font-medium">{selectionCount}</span>
          </div>

          {disabledReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">{buttonContent}</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{disabledReason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            buttonContent
          )}
        </div>
      </div>
    </div>
  );
}
