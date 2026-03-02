/**
 * NewEvaluationDialog
 *
 * Dialog for starting a new evaluation run with configurable sample size
 * and rollout model. Mirrors the finetune NewJobDialog pattern.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Loader2, FlaskConical } from "lucide-react";

const ROLLOUT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
];

function getDefaultSampleSize(recordCount: number): number {
  if (recordCount <= 10) return recordCount;
  if (recordCount <= 50) return Math.min(25, recordCount);
  if (recordCount <= 200) return 50;
  return 100;
}

function getSampleSizeOptions(recordCount: number): Array<{ value: number; label: string }> {
  if (recordCount <= 10) return [{ value: recordCount, label: `All (${recordCount})` }];
  if (recordCount <= 50) {
    const opts: Array<{ value: number; label: string }> = [];
    if (recordCount >= 10) opts.push({ value: 10, label: "10" });
    if (recordCount >= 25) opts.push({ value: 25, label: "25" });
    opts.push({ value: recordCount, label: `All (${recordCount})` });
    return opts;
  }
  if (recordCount <= 200) {
    const opts: Array<{ value: number; label: string }> = [];
    opts.push({ value: 10, label: "10" });
    opts.push({ value: 25, label: "25" });
    opts.push({ value: 50, label: "50" });
    if (recordCount >= 100) opts.push({ value: 100, label: "100" });
    opts.push({ value: recordCount, label: `All (${recordCount})` });
    return opts;
  }
  return [
    { value: 25, label: "25" },
    { value: 50, label: "50" },
    { value: 100, label: "100" },
    { value: 200, label: "200" },
    { value: recordCount, label: `All (${recordCount})` },
  ];
}

interface NewEvaluationDialogProps {
  recordCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (sampleSize: number, rolloutModel: string) => Promise<void>;
}

export function NewEvaluationDialog({
  recordCount,
  open,
  onOpenChange,
  onRun,
}: NewEvaluationDialogProps) {
  const [sampleSize, setSampleSize] = useState(() => getDefaultSampleSize(recordCount));
  const [rolloutModel, setRolloutModel] = useState("gpt-4o-mini");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sampleOptions = getSampleSizeOptions(recordCount);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onRun(sampleSize, rolloutModel);
      onOpenChange(false);
    } catch {
      // Error handled by caller
    } finally {
      setIsSubmitting(false);
    }
  }, [sampleSize, rolloutModel, isSubmitting, onRun, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            New Evaluation
          </DialogTitle>
          <DialogDescription>
            Run your grader script against a sample of training records.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 py-2">
          {/* Sample Size */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Sample Size</label>
            <Select
              value={String(sampleSize)}
              onValueChange={(v) => setSampleSize(Number(v))}
            >
              <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-300 ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus:outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sampleOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500 mt-2">
              Number of records to evaluate
            </p>
          </div>

          {/* Rollout Model */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Rollout Model</label>
            <Select value={rolloutModel} onValueChange={setRolloutModel}>
              <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-300 ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus:outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLLOUT_MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500 mt-2">
              Model used for generating rollout responses
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 pt-2">
          <Separator className="bg-zinc-800 mb-4" />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4" />
                  Run Evaluation
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
