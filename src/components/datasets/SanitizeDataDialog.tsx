/**
 * SanitizeDataDialog
 *
 * Dialog for running data sanitization on dataset records.
 * Validates records for RFT training and shows a hygiene report.
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Loader2,
  Lightbulb,
  Play,
  RotateCcw,
  MessageSquare,
  UserCheck,
  Link2,
  Hash,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import type { DatasetRecord } from "@/types/dataset-types";
import {
  sanitizeRecords,
  getErrorLabel,
  DEFAULT_VALIDATION_CONFIG,
  type HygieneReport,
  type ValidationError,
  type SanitizationResult,
} from "./sanitization-utils";

interface SanitizeDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DatasetRecord[];
  onSanitizationComplete?: (result: SanitizationResult) => void;
}

type DialogState = "idle" | "running" | "completed";

/** Helper component for validation check items */
function ValidationCheckItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-md border bg-card hover:bg-muted/30 transition-colors">
      <div className="shrink-0 mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function SanitizeDataDialog({
  open,
  onOpenChange,
  records,
  onSanitizationComplete,
}: SanitizeDataDialogProps) {
  const [state, setState] = useState<DialogState>("idle");
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<HygieneReport | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState("idle");
      setProgress(0);
      setReport(null);
    }
  }, [open]);

  const handleRunSanitization = useCallback(async () => {
    setState("running");
    setProgress(0);

    try {
      const sanitizationResult = await sanitizeRecords(
        records,
        DEFAULT_VALIDATION_CONFIG,
        (p) => setProgress(p)
      );

      setReport(sanitizationResult.report);
      setState("completed");

      if (onSanitizationComplete) {
        onSanitizationComplete(sanitizationResult);
      }
    } catch (error) {
      console.error("Sanitization error:", error);
      setState("idle");
    }
  }, [records, onSanitizationComplete]);

  const handleReset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setReport(null);
  }, []);

  const handleCopyReport = useCallback(() => {
    if (report) {
      const reportText = JSON.stringify(report, null, 2);
      navigator.clipboard.writeText(reportText);
    }
  }, [report]);

  // Calculate valid percentage
  const validPercent = report
    ? ((report.valid / report.total) * 100).toFixed(1)
    : "0";
  const invalidPercent = report
    ? ((report.rejected / report.total) * 100).toFixed(1)
    : "0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Sanitize Data
          </DialogTitle>
          <DialogDescription>
            Validate records for RFT training requirements
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Idle state - show validation checks */}
          {state === "idle" && (
            <div className="space-y-4">
              {/* Validation checks grid */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Validation Checks</p>
                <div className="grid gap-2">
                  <ValidationCheckItem
                    icon={<UserCheck className="h-4 w-4" />}
                    title="User Message Required"
                    description="Each record must have at least one user message"
                  />
                  <ValidationCheckItem
                    icon={<MessageSquare className="h-4 w-4" />}
                    title="Valid Message Roles"
                    description="Only system, user, assistant, and tool roles allowed"
                  />
                  <ValidationCheckItem
                    icon={<Link2 className="h-4 w-4" />}
                    title="Tool Chain Integrity"
                    description="Tool calls must have matching tool results"
                  />
                  <ValidationCheckItem
                    icon={<Hash className="h-4 w-4" />}
                    title="Token Limits"
                    description={`Content must be under ${DEFAULT_VALIDATION_CONFIG.maxTokens.toLocaleString()} tokens`}
                  />
                  <ValidationCheckItem
                    icon={<Fingerprint className="h-4 w-4" />}
                    title="Duplicate Detection"
                    description="Identifies and flags duplicate records"
                  />
                </div>
              </div>

              <Separator />

              {/* Record count and run button */}
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">Records to validate: </span>
                  <span className="font-semibold">{records.length.toLocaleString()}</span>
                </div>
                <Button onClick={handleRunSanitization}>
                  <Play className="h-4 w-4 mr-2" />
                  Run Sanitization
                </Button>
              </div>
            </div>
          )}

          {/* Running state - show progress */}
          {state === "running" && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">Validating records...</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {progress}% complete
              </p>
            </div>
          )}

          {/* Completed state - show report */}
          {state === "completed" && report && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Valid</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
                    {report.valid.toLocaleString()}
                  </p>
                  <p className="text-xs text-green-600/70">{validPercent}%</p>
                </div>

                <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-xs font-medium text-red-700 dark:text-red-400">Invalid</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">
                    {report.rejected.toLocaleString()}
                  </p>
                  <p className="text-xs text-red-600/70">{invalidPercent}%</p>
                </div>

                <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Duplicates</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
                    {report.duplicatesRemoved.toLocaleString()}
                  </p>
                  <p className="text-xs text-amber-600/70">
                    {((report.duplicatesRemoved / report.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <Separator />

              {/* Error breakdown */}
              {Object.keys(report.errorsByType).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Error Breakdown
                  </h4>
                  <div className="max-h-[120px] overflow-y-auto">
                    <div className="space-y-1.5">
                      {Object.entries(report.errorsByType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([error, count]) => (
                          <div
                            key={error}
                            className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50"
                          >
                            <span className="text-sm text-muted-foreground">
                              {getErrorLabel(error as ValidationError)}
                            </span>
                            <Badge variant="secondary" className="font-mono">
                              {count}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Recommendations
                  </h4>
                  <div className="space-y-1.5">
                    {report.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="text-xs text-muted-foreground p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/50"
                      >
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No errors message */}
              {Object.keys(report.errorsByType).length === 0 && report.duplicatesRemoved === 0 && (
                <div className="flex items-center justify-center gap-2 py-4 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">All records are valid!</span>
                </div>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={handleCopyReport}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy Report
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Run Again
                  </Button>
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
