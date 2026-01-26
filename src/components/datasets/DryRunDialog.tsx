/**
 * DryRunDialog
 *
 * Dialog for running dry run validation on dataset + grader.
 * Tests the grader on sample data to assess:
 * 1. Dataset quality - Are the prompts learnable?
 * 2. Grader quality - Does the evaluation function work correctly?
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Play,
  RotateCcw,
  FlaskConical,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ScoreHistogram } from "./ScoreHistogram";
import { cn } from "@/lib/utils";

interface DryRunResult {
  samples: Array<{
    prompt: string;
    response: string;
    score: number;
    topic?: string;
  }>;
  statistics: {
    mean: number;
    std: number;
    min: number;
    max: number;
    median: number;
  };
  byTopic: Record<string, { mean: number; count: number }>;
  verdict: "GO" | "NO-GO" | "WARNING";
  recommendations: string[];
}

interface DryRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of records available for sampling */
  recordCount: number;
  /** Whether grader is configured */
  hasGraderConfig: boolean;
  /** Callback to run dry run */
  onRunDryRun: (sampleSize: number) => Promise<DryRunResult>;
  /** Last dry run result (if any) */
  lastResult?: DryRunResult | null;
}

type DialogState = "idle" | "running" | "completed";

const SAMPLE_SIZE_OPTIONS = [100, 200, 300, 500];

export function DryRunDialog({
  open,
  onOpenChange,
  recordCount,
  hasGraderConfig,
  onRunDryRun,
  lastResult,
}: DryRunDialogProps) {
  const [state, setState] = useState<DialogState>(lastResult ? "completed" : "idle");
  const [sampleSize, setSampleSize] = useState(300);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DryRunResult | null>(lastResult ?? null);
  const [activeTab, setActiveTab] = useState<"overview" | "samples" | "topics">("overview");

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (lastResult) {
        setState("completed");
        setResult(lastResult);
      } else {
        setState("idle");
        setResult(null);
      }
      setProgress(0);
    }
  }, [open, lastResult]);

  const handleRunDryRun = useCallback(async () => {
    if (!hasGraderConfig) return;

    setState("running");
    setProgress(0);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 95));
    }, 500);

    try {
      const dryRunResult = await onRunDryRun(sampleSize);
      setResult(dryRunResult);
      setState("completed");
    } catch (error) {
      console.error("Dry run error:", error);
      setState("idle");
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
    }
  }, [hasGraderConfig, sampleSize, onRunDryRun]);

  const handleReset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setResult(null);
    setActiveTab("overview");
  }, []);

  // Extract scores for histogram
  const scores = result?.samples.map((s) => s.score) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Dry Run Validation
            {result && (
              <span
                className={cn(
                  "ml-2 px-2 py-0.5 rounded-full text-xs font-bold",
                  result.verdict === "GO"
                    ? "bg-green-600 text-white"
                    : result.verdict === "NO-GO"
                    ? "bg-red-600 text-white"
                    : "bg-amber-600 text-white"
                )}
              >
                {result.verdict === "GO" ? "🟢 GO" : result.verdict === "NO-GO" ? "🔴 NO-GO" : "🟡 WARNING"}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Test the grader on sample data to validate dataset and grader quality
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Idle state - configuration */}
          {state === "idle" && (
            <div className="space-y-4">
              {/* Grader check */}
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
                          onClick={() => setSampleSize(size)}
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
              </div>

              <Separator />

              {/* Run button */}
              <div className="flex items-center justify-end">
                <Button onClick={handleRunDryRun} disabled={!hasGraderConfig}>
                  <Play className="h-4 w-4 mr-2" />
                  Run Dry Run
                </Button>
              </div>
            </div>
          )}

          {/* Running state - progress */}
          {state === "running" && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">Running dry run validation...</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Testing {sampleSize} samples with configured grader
              </p>
            </div>
          )}

          {/* Completed state - results */}
          {state === "completed" && result && (
            <div className="space-y-4">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="topics">By Topic</TabsTrigger>
                  <TabsTrigger value="samples">Samples</TabsTrigger>
                </TabsList>

                {/* Overview tab */}
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <ScoreHistogram scores={scores} showMean showStats />

                  {/* Recommendations */}
                  {result.recommendations.length > 0 && (
                    <div className="rounded-md bg-muted/50 border p-3 space-y-2">
                      <p className="text-sm font-medium">Recommendations:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {result.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span>•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                {/* By Topic tab */}
                <TabsContent value="topics" className="space-y-3 mt-4">
                  {Object.entries(result.byTopic).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(result.byTopic)
                        .sort(([, a], [, b]) => b.mean - a.mean)
                        .map(([topic, data]) => (
                          <div
                            key={topic}
                            className="flex items-center justify-between p-2 rounded-md border bg-card"
                          >
                            <div>
                              <p className="text-sm font-medium">{topic}</p>
                              <p className="text-xs text-muted-foreground">
                                {data.count} samples
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-24 bg-muted rounded-full overflow-hidden"
                              >
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    data.mean < 0.3
                                      ? "bg-red-500"
                                      : data.mean < 0.5
                                      ? "bg-amber-500"
                                      : "bg-green-500"
                                  )}
                                  style={{ width: `${data.mean * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-mono w-12 text-right">
                                {data.mean.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No topic data available
                    </p>
                  )}
                </TabsContent>

                {/* Samples tab */}
                <TabsContent value="samples" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* High scores */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Highest Scores
                      </div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {result.samples
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 5)
                          .map((sample, i) => (
                            <SampleCard key={i} sample={sample} />
                          ))}
                      </div>
                    </div>

                    {/* Low scores */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                        <XCircle className="h-4 w-4" />
                        Lowest Scores
                      </div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {result.samples
                          .sort((a, b) => a.score - b.score)
                          .slice(0, 5)
                          .map((sample, i) => (
                            <SampleCard key={i} sample={sample} />
                          ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Separator />

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Run Again
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                  {result.verdict === "GO" && (
                    <Button size="sm">
                      Start Training →
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Sample card for displaying individual samples */
function SampleCard({
  sample,
}: {
  sample: { prompt: string; response: string; score: number; topic?: string };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-card p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "font-mono px-1.5 py-0.5 rounded",
            sample.score < 0.3
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : sample.score < 0.7
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          )}
        >
          {sample.score.toFixed(2)}
        </span>
        {sample.topic && (
          <span className="text-muted-foreground">{sample.topic}</span>
        )}
      </div>
      <p className="text-muted-foreground line-clamp-2">{sample.prompt}</p>
      {expanded && (
        <div className="mt-2 p-2 rounded bg-muted/50">
          <p className="font-medium mb-1">Response:</p>
          <p className="text-muted-foreground">{sample.response}</p>
        </div>
      )}
      <button
        className="text-primary text-xs mt-1 hover:underline"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide response" : "Show response"}
      </button>
    </div>
  );
}
