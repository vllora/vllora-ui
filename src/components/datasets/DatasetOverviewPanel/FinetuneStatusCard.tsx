/**
 * FinetuneStatusCard — Shows the latest finetune job status with
 * a colored dot indicator and model name.
 */

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinetuneJob } from "@/services/finetune-api";

export function FinetuneStatusCard({ latestJob }: { latestJob: FinetuneJob | null }) {
  const statusConfig = useMemo(() => {
    if (!latestJob) {
      return { label: "NO JOB YET", dotClass: "bg-muted-foreground/40" };
    }
    switch (latestJob.status) {
      case "succeeded":
        return { label: "READY", dotClass: "bg-green-500" };
      case "running":
        return { label: "TRAINING", dotClass: "bg-[rgb(var(--theme-500))] animate-pulse" };
      case "failed":
        return { label: "FAILED", dotClass: "bg-destructive" };
      case "pending":
        return { label: "PENDING", dotClass: "bg-muted-foreground/40" };
      case "cancelled":
        return { label: "CANCELLED", dotClass: "bg-muted-foreground/40" };
      default:
        return { label: "UNKNOWN", dotClass: "bg-muted-foreground/40" };
    }
  }, [latestJob]);

  const modelName = latestJob?.fine_tuned_model ?? latestJob?.base_model;

  return (
    <div className="h-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Finetune Status
        </span>
        <TrendingUp className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("w-2 h-2 rounded-full shrink-0", statusConfig.dotClass)} />
        <span className="text-xs font-bold tracking-wide">{statusConfig.label}</span>
      </div>
      {modelName && (
        <div className="text-[10px] text-muted-foreground truncate">{modelName}</div>
      )}
      {latestJob?.error_message && (
        <div className="text-[10px] text-destructive mt-0.5 truncate">
          {latestJob.error_message}
        </div>
      )}
    </div>
  );
}
