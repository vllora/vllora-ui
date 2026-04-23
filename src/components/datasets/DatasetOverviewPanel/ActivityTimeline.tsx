/**
 * ActivityTimeline — Timeline container with header, loading skeleton,
 * empty state, and vertical connecting line for activity entries.
 */

import { Activity, Clock, Zap } from "lucide-react";
import type { ActivityTimelineProps } from "./types";
import { ActivityEntryRow } from "./ActivityEntryRow";

export function ActivityTimeline({ entries, isLoading, isLive }: ActivityTimelineProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Activity</span>
        </div>
        {isLive && (
          <div className="flex items-center gap-1 text-[rgb(var(--theme-500))] bg-[rgb(var(--theme-500))]/10 px-2 py-0.5 rounded-full">
            <Zap className="w-3 h-3" />
            <span className="text-[10px] font-semibold uppercase">Live Updates</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-2.5 w-1/3 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 py-12">
            <Clock className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No activity yet. Run a plan or evaluation to see history here.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-[25px] top-0 bottom-0 w-px bg-border" />
            {entries.map((entry) => (
              <ActivityEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
