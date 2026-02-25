/**
 * ActivityEntryRow — A single row in the activity timeline, with status icon,
 * type/status badges, detail text, progress bar, and expandable detail blocks.
 */

import {
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
  Circle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEntry, ActivityCategoryBadgeTone } from "./types";
import { formatRelativeTime } from "./utils";
import { ActivityDetailBlocks } from "./ActivityDetailBlocks";

export function ActivityEntryRow({ entry }: { entry: ActivityEntry }) {
  const isRunning = entry.status === "running";

  const StatusIcon = () => {
    if (entry.status === "completed") {
      return (
        <CheckCircle2
          className="text-green-500 shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    if (entry.status === "failed" || entry.status === "cancelled") {
      return (
        <XCircle
          className="text-destructive shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    if (entry.status === "running") {
      return (
        <Loader2
          className="animate-spin text-[rgb(var(--theme-500))] shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    if (entry.status === "skipped") {
      return (
        <SkipForward
          className="text-muted-foreground/60 shrink-0"
          style={{ width: 18, height: 18 }}
        />
      );
    }
    // pending
    return (
      <Circle
        className="text-muted-foreground shrink-0"
        style={{ width: 18, height: 18 }}
      />
    );
  };

  const TypeBadge = () => {
    if (entry.categoryBadge) {
      const badgeClassesByTone: Record<ActivityCategoryBadgeTone, string> = {
        data: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        eval: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        finetune: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
        neutral: "bg-muted text-muted-foreground",
      };
      return (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium",
            badgeClassesByTone[entry.categoryBadge.tone]
          )}
        >
          {entry.categoryBadge.label}
        </span>
      );
    }

    if (entry.type === "evaluation") {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
          Eval
        </span>
      );
    }
    if (entry.type === "finetune") {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
          Fine-tune
        </span>
      );
    }
    return null;
  };

  const StatusBadge = () => {
    const baseClasses =
      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide";
    if (entry.status === "completed") {
      return (
        <span className={cn(baseClasses, "bg-green-500/10 text-green-700 dark:text-green-400")}>
          DONE
        </span>
      );
    }
    if (entry.status === "failed") {
      return (
        <span className={cn(baseClasses, "bg-destructive/10 text-destructive")}>
          FAILED
        </span>
      );
    }
    if (entry.status === "cancelled") {
      return (
        <span className={cn(baseClasses, "bg-destructive/10 text-destructive")}>
          CANCELLED
        </span>
      );
    }
    if (entry.status === "skipped") {
      return (
        <span className={cn(baseClasses, "bg-muted text-muted-foreground")}>
          SKIPPED
        </span>
      );
    }
    if (entry.status === "running") {
      return (
        <span
          className={cn(
            baseClasses,
            "bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]"
          )}
        >
          RUNNING
        </span>
      );
    }
    // pending
    return (
      <span className={cn(baseClasses, "bg-muted text-muted-foreground")}>
        PENDING
      </span>
    );
  };

  const isSkippedOrPending =
    entry.status === "skipped" || entry.status === "pending";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors relative",
        isRunning ? "bg-[rgb(var(--theme-500))]/5" : "hover:bg-muted/30"
      )}
    >
      {/* Icon sits on the vertical line */}
      <div className="shrink-0 z-10 mt-0.5 bg-background rounded-full">
        <StatusIcon />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        {/* Header: type/label on left, status/time on right */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeBadge />
              <span
                className={cn(
                  "text-sm font-semibold",
                  isSkippedOrPending && "text-muted-foreground"
                )}
              >
                {entry.label}
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <StatusBadge />
            {entry.timestamp != null && (
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeTime(entry.timestamp)}
              </span>
            )}
            {entry.action && (
              <button
                type="button"
                onClick={entry.action.onClick}
                title={entry.action.title}
                aria-label={entry.action.title}
                className="w-6 h-6 rounded-full border border-border/50 bg-background/60 text-muted-foreground hover:text-foreground hover:border-[rgb(var(--theme-500))]/40 hover:bg-[rgb(var(--theme-500))]/5 transition-colors flex items-center justify-center"
              >
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Primary detail */}
        {entry.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {entry.detail}
          </p>
        )}

        {/* Secondary detail */}
        {entry.secondaryDetail && (
          <p
            className={cn(
              "text-xs mt-0.5",
              entry.status === "failed" || entry.status === "cancelled"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {entry.secondaryDetail}
          </p>
        )}

        {/* Progress bar (running only) */}
        {isRunning && (
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 bg-[rgb(var(--theme-500))]",
                entry.progress == null && "animate-pulse w-1/3"
              )}
              style={
                entry.progress != null
                  ? { width: `${entry.progress}%` }
                  : undefined
              }
            />
          </div>
        )}

        {entry.details && entry.details.length > 0 && (
          <div className="mt-2">
            <ActivityDetailBlocks blocks={entry.details} />
          </div>
        )}

      </div>
    </div>
  );
}
