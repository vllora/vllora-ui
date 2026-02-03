/**
 * StepIcon
 *
 * Visual indicator for workflow step status.
 * Shows different icons based on step state: completed, failed, skipped, in_progress, current, or pending.
 */

import { Check, Loader2, X } from "lucide-react";
import type { StepStatus } from "@/services/finetune-workflow-db";

interface StepIconProps {
  status: StepStatus;
  isCurrent: boolean;
}

export function StepIcon({ status, isCurrent }: StepIconProps) {
  if (status === "completed") {
    return <Check className="w-3 h-3 text-emerald-500" />;
  }
  if (status === "failed") {
    return <X className="w-3 h-3 text-destructive" />;
  }
  if (status === "skipped") {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  if (status === "in_progress") {
    // Only show spinner when step is actively processing
    return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
  }
  if (isCurrent) {
    // Current step but not actively processing - show filled dot
    return <div className="w-2 h-2 rounded-full bg-primary" />;
  }
  return <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />;
}
