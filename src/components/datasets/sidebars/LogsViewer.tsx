/**
 * LogsViewer
 *
 * Timeline component for logs.md — shows aggregated activity
 * from workflow state, documents, dry runs, and finetune jobs.
 */

import { useMemo } from "react";
import {
  FileText,
  FlaskConical,
  Rocket,
  Settings,
  ScrollText,
  Info,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { buildActivityLog, type ActivityLogEntry, type LogEntryType } from "@/services/activity-log-service";
import { cn } from "@/lib/utils";

const ICON_CLS = "w-3.5 h-3.5";

function entryIcon(type: LogEntryType) {
  switch (type) {
    case "workflow":
      return <Settings className={cn(ICON_CLS, "text-[rgb(var(--theme-500))]")} />;
    case "document":
      return <FileText className={cn(ICON_CLS, "text-blue-500")} />;
    case "generation":
      return <ScrollText className={cn(ICON_CLS, "text-violet-500")} />;
    case "evaluation":
      return <FlaskConical className={cn(ICON_CLS, "text-amber-500")} />;
    case "finetune":
      return <Rocket className={cn(ICON_CLS, "text-[rgb(var(--theme-500))]")} />;
    default:
      return <Info className={cn(ICON_CLS, "text-muted-foreground")} />;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LogsViewer() {
  const { dataset } = DatasetDetailConsumer();
  const { sources } = KnowledgeSourcesConsumer();
  const { jobs: dryRunJobs } = EvalJobsConsumer();
  const { filteredJobs: finetuneJobs } = FinetuneJobsConsumer();

  const entries = useMemo(
    () =>
      buildActivityLog({
        knowledgeSources: sources,
        dryRunJobs,
        finetuneJobs,
        topicsGeneratedAt: dataset?.topicHierarchy?.generatedAt,
        graderConfiguredAt: undefined, // TODO: extract from workflow state
      }),
    [sources, dryRunJobs, finetuneJobs, dataset?.topicHierarchy?.generatedAt]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
          <ScrollText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activity will appear here as you work on your dataset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
        Activity ({entries.length})
      </h3>
      <div className="space-y-0.5">
        {entries.map((entry) => (
          <LogEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: ActivityLogEntry }) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors">
      <span className="mt-0.5 shrink-0">{entryIcon(entry.type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground leading-snug truncate">{entry.title}</p>
        {entry.detail && (
          <p className="text-[11px] text-muted-foreground truncate">{entry.detail}</p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums mt-0.5">
        {formatTime(entry.timestamp)}
      </span>
    </div>
  );
}
