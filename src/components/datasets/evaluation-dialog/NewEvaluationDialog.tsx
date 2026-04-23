/**
 * NewEvaluationDialog
 *
 * Enhanced dialog for starting a new evaluation run.
 * Adapts to 3 states:
 *   1. First eval (no previous runs) — grader preview + config
 *   2. Returning eval (grader unchanged) — adds version badge + previous best
 *   3. Returning eval (grader modified) — stale warning + version info
 */

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  Loader2,
  FlaskConical,
  Code2,
  Play,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

const ROLLOUT_MODEL_OPTIONS = [
  // Strong models — for grader/data validation (Phase 1)
  { value: "gpt-4o-mini", label: "GPT-4o Mini", group: "Eval Models" },
  { value: "gpt-4o", label: "GPT-4o", group: "Eval Models" },
  { value: "gpt-4.1", label: "GPT-4.1", group: "Eval Models" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", group: "Eval Models" },
  // Base models — for pre/post-training baseline comparison
  { value: "Qwen3.5-0.8B", label: "Qwen 3.5 0.8B", group: "Base Models" },
  { value: "Qwen3.5-2B", label: "Qwen 3.5 2B", group: "Base Models" },
  { value: "Qwen3.5-4B", label: "Qwen 3.5 4B (default)", group: "Base Models" },
  { value: "Qwen3.5-9B", label: "Qwen 3.5 9B", group: "Base Models" },
];

function getDefaultSampleSize(recordCount: number): number {
  if (recordCount <= 10) return recordCount;
  if (recordCount <= 50) return recordCount;
  if (recordCount <= 200) return recordCount;
  return recordCount;
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

function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface GraderInfo {
  readonly name: string;
  readonly type: string;
  readonly model?: string;
}

export interface PreviousBestInfo {
  readonly score: number;
  readonly timestamp: number;
}

export interface EvaluatorVersionInfo {
  readonly latestVersion: number | null;
  readonly isGraderModified: boolean;
}

interface NewEvaluationDialogProps {
  readonly recordCount: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRun: (sampleSize: number, rolloutModel: string) => Promise<void>;
  readonly graderInfo?: GraderInfo;
  readonly previousBest?: PreviousBestInfo;
  readonly versionInfo?: EvaluatorVersionInfo;
  readonly onEditGrader?: () => void;
}

export function NewEvaluationDialog({
  recordCount,
  open,
  onOpenChange,
  onRun,
  graderInfo,
  previousBest,
  versionInfo,
  onEditGrader,
}: NewEvaluationDialogProps) {
  const [sampleSize, setSampleSize] = useState(() => getDefaultSampleSize(recordCount));
  const [rolloutModel, setRolloutModel] = useState("gpt-4o-mini");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sampleOptions = getSampleSizeOptions(recordCount);

  const isGraderModified = versionInfo?.isGraderModified ?? false;
  const hasVersions = (versionInfo?.latestVersion ?? 0) > 0;

  const graderDetail = useMemo(() => {
    if (!graderInfo) return null;
    const parts = [graderInfo.type];
    if (graderInfo.model) parts.push(graderInfo.model);
    if (isGraderModified) {
      parts.push("edited recently");
    }
    return parts.join(" · ");
  }, [graderInfo, isGraderModified]);

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
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Run Evaluation
          </DialogTitle>
          <DialogDescription className="text-xs">
            Test your evaluator against training records
          </DialogDescription>
        </DialogHeader>

        {/* Grader preview card */}
        {graderInfo && (
          <div
            className={`flex items-center gap-2.5 rounded-lg border p-2.5 ${
              isGraderModified
                ? "border-amber-500/25 bg-amber-500/[0.03]"
                : "border-border/50 bg-muted/20"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                isGraderModified
                  ? "bg-amber-500/10"
                  : "bg-[rgb(var(--theme-600))]/10"
              }`}
            >
              <Code2
                className={`h-3.5 w-3.5 ${
                  isGraderModified
                    ? "text-amber-500"
                    : "text-[rgb(var(--theme-600))]"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {graderInfo.name}
                {isGraderModified && (
                  <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-500">
                    modified
                  </span>
                )}
                {!isGraderModified && hasVersions && (
                  <span className="rounded border border-zinc-500/30 bg-zinc-500/20 px-1.5 py-px text-[10px] font-medium text-zinc-400">
                    v{versionInfo?.latestVersion}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {graderDetail}
              </div>
            </div>
            {onEditGrader && (
              <button
                onClick={onEditGrader}
                className="shrink-0 text-[11px] text-[rgb(var(--theme-600))] hover:underline"
              >
                {isGraderModified ? "Review" : "Edit"}
              </button>
            )}
          </div>
        )}

        {/* Stale warning banner */}
        {isGraderModified && hasVersions && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/12 bg-amber-500/[0.04] px-2.5 py-2 text-[11px] text-amber-600 dark:text-amber-400/80">
            <TriangleAlert className="h-3 w-3 shrink-0" />
            Evaluator changed since last eval (v{versionInfo?.latestVersion}). This run will create v
            {(versionInfo?.latestVersion ?? 0) + 1}.
          </div>
        )}

        {/* Config fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Samples
            </label>
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
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Rollout Model
            </label>
            <Select value={rolloutModel} onValueChange={setRolloutModel}>
              <SelectTrigger className="h-8 text-xs border-border/50 bg-muted/30 focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-[10px] text-muted-foreground/70">Eval Models (grader validation)</SelectLabel>
                  {ROLLOUT_MODEL_OPTIONS.filter((o) => o.group === "Eval Models").map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] text-muted-foreground/70">Base Models (pre/post-training baseline)</SelectLabel>
                  {ROLLOUT_MODEL_OPTIONS.filter((o) => o.group === "Base Models").map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Previous best score */}
        {previousBest && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
              isGraderModified
                ? "border-amber-500/15 bg-amber-500/[0.02]"
                : "border-[rgb(var(--theme-600))]/10 bg-[rgb(var(--theme-600))]/[0.03]"
            }`}
          >
            <TrendingUp
              className={`h-3.5 w-3.5 shrink-0 ${
                isGraderModified
                  ? "text-amber-500"
                  : "text-[rgb(var(--theme-600))]"
              }`}
            />
            <span className="flex-1 text-[11px] text-muted-foreground">
              Previous best
              {isGraderModified && hasVersions && (
                <span className="text-zinc-600"> (v{versionInfo?.latestVersion})</span>
              )}
            </span>
            <span
              className={`font-mono text-[13px] font-semibold ${
                isGraderModified
                  ? "text-amber-500"
                  : "text-[rgb(var(--theme-600))]"
              }`}
            >
              {previousBest.score.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">
              · {formatRelativeTime(previousBest.timestamp)}
            </span>
          </div>
        )}

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
                <Play className="h-3 w-3" />
                Run · {sampleSize} samples
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
