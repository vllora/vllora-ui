/**
 * ConfigView
 *
 * Configuration screen for starting a new dry run.
 * Allows selecting sample size and shows what will happen.
 */

import { AlertTriangle, History, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Generate sample size options based on record count
 * For small datasets: show smaller increments
 * For large datasets: show larger increments
 */
function getSampleSizeOptions(recordCount: number): Array<{ value: number; label: string }> {
  if (recordCount <= 10) {
    // Very small dataset - show "All" option
    return [{ value: recordCount, label: "All" }];
  }

  if (recordCount <= 50) {
    // Small dataset - show 10, 25, and All
    const options: Array<{ value: number; label: string }> = [];
    if (recordCount >= 10) options.push({ value: 10, label: "10" });
    if (recordCount >= 25) options.push({ value: 25, label: "25" });
    options.push({ value: recordCount, label: "All" });
    return options;
  }

  if (recordCount <= 200) {
    // Medium dataset - show 25, 50, 100, and All
    const options: Array<{ value: number; label: string }> = [];
    options.push({ value: 25, label: "25" });
    options.push({ value: 50, label: "50" });
    if (recordCount >= 100) options.push({ value: 100, label: "100" });
    options.push({ value: recordCount, label: "All" });
    return options;
  }

  // Large dataset - show fixed increments
  const options: Array<{ value: number; label: string }> = [];
  options.push({ value: 100, label: "100" });
  options.push({ value: 200, label: "200" });
  if (recordCount >= 300) options.push({ value: 300, label: "300" });
  if (recordCount >= 500) options.push({ value: 500, label: "500" });

  return options;
}

const ROLLOUT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
];

interface ConfigViewProps {
  recordCount: number;
  hasGraderConfig: boolean;
  sampleSize: number;
  onSampleSizeChange: (size: number) => void;
  rolloutModel: string;
  onRolloutModelChange: (model: string) => void;
  onRunDryRun: () => void;
  onViewHistory: () => void;
  hasHistory: boolean;
}

export function ConfigView({
  recordCount,
  hasGraderConfig,
  sampleSize,
  onSampleSizeChange,
  rolloutModel,
  onRolloutModelChange,
  onRunDryRun,
  onViewHistory,
  hasHistory,
}: ConfigViewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Warnings */}
        {!hasGraderConfig && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-400">Grader not configured</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Please configure a grader before running dry run validation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sample size and model selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Sample Size</label>
            <div className="flex gap-2">
              {getSampleSizeOptions(recordCount).map((option) => (
                <button
                  key={option.value}
                  onClick={() => onSampleSizeChange(option.value)}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    sampleSize === option.value
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {recordCount.toLocaleString()} records available
            </p>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Rollout Model</label>
            <Select value={rolloutModel} onValueChange={onRolloutModelChange}>
              <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-300 focus:ring-zinc-600 focus:ring-offset-0">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {ROLLOUT_MODEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500 mt-2">
              Model for generating responses
            </p>
          </div>
        </div>

        {/* Simple description */}
        <div className="text-sm text-zinc-500">
          <p>
            This will sample <span className="text-zinc-300">{sampleSize} prompts</span>,
            generate responses using the base model, and score them with your configured grader.
          </p>
          <p className="mt-2 text-xs">
            Runs in background — you can close this dialog.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 pt-4">
        <Separator className="bg-zinc-800 mb-4" />
        <div className="flex items-center justify-between">
          {hasHistory ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewHistory}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              <History className="h-4 w-4 mr-1.5" />
              History
            </Button>
          ) : (
            <div />
          )}
          <Button
            onClick={onRunDryRun}
            disabled={!hasGraderConfig}
            className="bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
          >
            <Play className="h-4 w-4 mr-1.5" />
            Start Dry Run
          </Button>
        </div>
      </div>
    </div>
  );
}
