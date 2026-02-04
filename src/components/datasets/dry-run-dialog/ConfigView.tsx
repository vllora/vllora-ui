/**
 * ConfigView
 *
 * Configuration screen for starting a new dry run.
 * Allows selecting sample size and shows what will happen.
 */

import { AlertTriangle, History, Play, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const SAMPLE_SIZE_OPTIONS = [100, 200, 300, 500];

interface ConfigViewProps {
  recordCount: number;
  hasGraderConfig: boolean;
  sampleSize: number;
  onSampleSizeChange: (size: number) => void;
  onRunDryRun: () => void;
  onViewHistory: () => void;
  hasHistory: boolean;
}

export function ConfigView({
  recordCount,
  hasGraderConfig,
  sampleSize,
  onSampleSizeChange,
  onRunDryRun,
  onViewHistory,
  hasHistory,
}: ConfigViewProps) {
  return (
    <div className="space-y-4">
      {/* Warnings */}
      {!hasGraderConfig && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Grader not configured
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                Please configure a grader before running dry run validation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Configuration</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Sample Size</label>
            <div className="flex gap-2 mt-1.5">
              {SAMPLE_SIZE_OPTIONS.map((size) => (
                <Button
                  key={size}
                  variant={sampleSize === size ? "default" : "outline"}
                  size="sm"
                  onClick={() => onSampleSizeChange(size)}
                  disabled={size > recordCount}
                >
                  {size}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Available: {recordCount.toLocaleString()} records
            </p>
          </div>
        </div>
      </div>

      {/* What happens */}
      <div className="text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">What will happen:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Sample {sampleSize} prompts from dataset</li>
          <li>Generate responses using base model</li>
          <li>Score each response with configured grader</li>
          <li>Analyze distribution and provide diagnosis</li>
        </ol>
        <p className="text-xs italic mt-2">
          The dry run will continue in the background - you can close this dialog.
        </p>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between">
        {hasHistory && (
          <Button variant="ghost" size="sm" onClick={onViewHistory}>
            <History className="h-4 w-4 mr-2" />
            View History
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={onRunDryRun} disabled={!hasGraderConfig}>
          <Play className="h-4 w-4 mr-2" />
          Run Dry Run
        </Button>
      </div>
    </div>
  );
}
