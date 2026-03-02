/**
 * NewEvaluationDialog
 *
 * Lightweight dialog for starting a new evaluation run.
 * Two inline fields (sample size + model) with a clean, minimal layout.
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
      <DialogContent className="max-w-sm gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Run Evaluation
          </DialogTitle>
          <DialogDescription className="text-xs">
            Test your grader script on a sample of records.
          </DialogDescription>
        </DialogHeader>

        {/* Inline config row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Samples</label>
            <Select
              value={String(sampleSize)}
              onValueChange={(v) => setSampleSize(Number(v))}
            >
              <SelectTrigger className="h-8 text-xs border-border/50 bg-muted/30 focus:ring-0 focus:ring-offset-0">
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
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Model</label>
            <Select value={rolloutModel} onValueChange={setRolloutModel}>
              <SelectTrigger className="h-8 text-xs border-border/50 bg-muted/30 focus:ring-0 focus:ring-offset-0">
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <FlaskConical className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
