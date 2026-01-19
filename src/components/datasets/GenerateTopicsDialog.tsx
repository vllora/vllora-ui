/**
 * GenerateTopicsDialog
 *
 * Dialog for generating a dataset-wide topic hierarchy.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GenerateTopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextValue: string;
  onContextChange: (value: string) => void;
  onGenerate: (context: string) => void;
  isGenerating: boolean;
}

export function GenerateTopicsDialog({
  open,
  onOpenChange,
  contextValue,
  onContextChange,
  onGenerate,
  isGenerating,
}: GenerateTopicsDialogProps) {
  const [draft, setDraft] = useState(contextValue);

  useEffect(() => {
    if (open) {
      setDraft(contextValue);
    }
  }, [open, contextValue]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDraft(contextValue);
    }
    onOpenChange(nextOpen);
  };

  const handleGenerate = () => {
    const nextContext = draft.trim();
    onContextChange(nextContext);
    onGenerate(nextContext);
  };

  const isDisabled = !draft.trim() || isGenerating;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Topic Tree</DialogTitle>
          <DialogDescription>
            Describe the themes you want new data generated for. We will build a dataset-wide topic tree from this context.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Example: Travel planning for Japan, including itinerary design, budget constraints, transit advice, cultural tips, and restaurant recommendations."
            className="min-h-[140px]"
            autoFocus
          />
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
            {isGenerating ? "Generating..." : "Generate Topics"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
