/**
 * ConfigView
 *
 * Compact single-row configuration for starting a dry run.
 * Everything inline: sample pills, model select, run button.
 */

import { AlertTriangle, History, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function getSampleSizeOptions(recordCount: number): Array<{ value: number; label: string }> {
  if (recordCount <= 10) {
    return [{ value: recordCount, label: "All" }];
  }

  if (recordCount <= 50) {
    const options: Array<{ value: number; label: string }> = [];
    if (recordCount >= 10) options.push({ value: 10, label: "10" });
    if (recordCount >= 25) options.push({ value: 25, label: "25" });
    options.push({ value: recordCount, label: "All" });
    return options;
  }

  if (recordCount <= 200) {
    const options: Array<{ value: number; label: string }> = [];
    options.push({ value: 25, label: "25" });
    options.push({ value: 50, label: "50" });
    if (recordCount >= 100) options.push({ value: 100, label: "100" });
    options.push({ value: recordCount, label: "All" });
    return options;
  }

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
  const sampleOptions = getSampleSizeOptions(recordCount);

  if (!hasGraderConfig) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-xs text-amber-400/80">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Save your evaluator script to enable evaluation</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-full gap-2">
      {/* Main config row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Sample size */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">Sample</span>
          <div className="flex gap-0.5">
            {sampleOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onSampleSizeChange(option.value)}
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                  sampleSize === option.value
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-zinc-600">
            of {recordCount.toLocaleString()}
          </span>
        </div>

        <div className="w-px h-4 bg-zinc-800" />

        {/* Rollout model */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">Model</span>
          <Select value={rolloutModel} onValueChange={onRolloutModelChange}>
            <SelectTrigger className="h-7 w-[140px] bg-zinc-800/50 border-zinc-700/50 text-xs text-zinc-300 focus:ring-zinc-600 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLLOUT_MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-px h-4 bg-zinc-800" />

        {/* Run button */}
        <Button
          size="sm"
          onClick={onRunDryRun}
          className="h-7 px-3 text-xs gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
        >
          <Play className="h-3 w-3" />
          Run
        </Button>

        {/* History link */}
        {hasHistory && (
          <>
            <div className="w-px h-4 bg-zinc-800" />
            <button
              onClick={onViewHistory}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <History className="h-3 w-3" />
              <span>History</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
