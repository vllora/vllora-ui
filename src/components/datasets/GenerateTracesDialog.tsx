/**
 * GenerateTracesDialog
 *
 * Dialog for generating synthetic traces.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface GenerateTracesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  maxTurns: number;
  onCountChange: (value: number) => void;
  onMaxTurnsChange: (value: number) => void;
  onGenerate: (count: number, maxTurns: number) => void;
  isGenerating: boolean;
}

export function GenerateTracesDialog({
  open,
  onOpenChange,
  count,
  maxTurns,
  onCountChange,
  onMaxTurnsChange,
  onGenerate,
  isGenerating,
}: GenerateTracesDialogProps) {
  const [countDraft, setCountDraft] = useState(String(count));
  const [turnsDraft, setTurnsDraft] = useState(String(maxTurns));

  useEffect(() => {
    if (open) {
      setCountDraft(String(count));
      setTurnsDraft(String(maxTurns));
    }
  }, [open, count, maxTurns]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCountDraft(String(count));
      setTurnsDraft(String(maxTurns));
    }
    onOpenChange(nextOpen);
  };

  const parsePositiveInt = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const handleGenerate = () => {
    const nextCount = parsePositiveInt(countDraft, count);
    const nextTurns = parsePositiveInt(turnsDraft, maxTurns);
    onCountChange(nextCount);
    onMaxTurnsChange(nextTurns);
    onGenerate(nextCount, nextTurns);
  };

  const isDisabled = isGenerating || Number.parseInt(countDraft, 10) <= 0 || Number.parseInt(turnsDraft, 10) <= 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Data</DialogTitle>
          <DialogDescription>
            Choose how many synthetic traces to generate and how many user turns per trace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Count</label>
            <Input
              type="number"
              min={1}
              value={countDraft}
              onChange={(e) => setCountDraft(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <label className="text-sm font-medium">Max turns</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="What is max turns?"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Max turns = max number of user messages in the conversation (including the first user message).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="number"
              min={1}
              value={turnsDraft}
              onChange={(e) => setTurnsDraft(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isDisabled}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
