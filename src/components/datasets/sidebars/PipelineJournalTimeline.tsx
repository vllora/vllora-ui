/**
 * PipelineJournalTimeline
 *
 * Compact vertical timeline with phase-colored dots and a connecting line.
 * Two views: Timeline (interactive) and Document (markdown narrative).
 */

import { useState, useCallback, useMemo, useRef, type DragEvent } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  ScrollText,
  List,
  FileTextIcon,
  Upload,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PipelineJournal,
  PipelineJournalEntry,
  JournalEntryStatus,
  JournalEvalResults,
} from "@/types/pipeline-journal-types";

type JournalViewMode = "timeline" | "document";

// =============================================================================
// Phase colors
// =============================================================================

type Phase = "setup" | "data" | "eval" | "training" | "analysis";

function stepPhase(step: string): Phase {
  if (step.includes("objective") || step.includes("extraction")) return "setup";
  if (step.includes("topics") || step.includes("records") || step.includes("grader") || step.includes("quality") || step.includes("verify")) return "data";
  if (step.includes("eval") || step.includes("difficulty") || step.includes("readiness") || step.includes("headroom")) return "eval";
  if (step.includes("training")) return "training";
  return "analysis";
}

const PHASE_DOT: Record<Phase, string> = {
  setup: "bg-blue-500",
  data: "bg-violet-500",
  eval: "bg-amber-500",
  training: "bg-emerald-500",
  analysis: "bg-rose-500",
};

const PHASE_LINE: Record<Phase, string> = {
  setup: "bg-blue-500/30",
  data: "bg-violet-500/30",
  eval: "bg-amber-500/30",
  training: "bg-emerald-500/30",
  analysis: "bg-rose-500/30",
};

// =============================================================================
// Helpers
// =============================================================================

function stepLabel(step: string): string {
  const MAP: Record<string, string> = {
    step_1_objective: "Define Objective",
    step_2_extraction: "Extract Documents",
    step_3_topics: "Build Topics",
    step_4_records: "Generate Records",
    step_5_grader: "Write Grader",
    step_5_5_quality: "Data Quality Gate",
    step_5_5_quality_gate: "Data Quality Gate",
    step_6_verify: "Verify Gateway",
    step_7_eval: "Evaluation",
    step_7c_difficulty: "Difficulty Probe",
    step_7c_readiness: "Readiness Gate",
    step_7d_headroom: "Headroom Check",
    step_7e_training: "Training",
    step_8_analysis: "Post-Training Analysis",
    step_9_decision: "Decision",
    step_9_iteration: "Iteration",
  };
  return MAP[step] ?? step.replace(/^step_\d+[a-z]?_?/, "").replace(/_/g, " ");
}

function statusIcon(status: JournalEntryStatus) {
  switch (status) {
    case "completed": case "pass": case "succeeded":
      return { Icon: CheckCircle2, cls: "text-emerald-500" };
    case "in_progress":
      return { Icon: Loader2, cls: "text-blue-400 animate-spin" };
    case "warn":
      return { Icon: AlertTriangle, cls: "text-amber-400" };
    case "fail": case "error":
      return { Icon: XCircle, cls: "text-red-400" };
    default:
      return { Icon: CheckCircle2, cls: "text-muted-foreground" };
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isEvalResults(results: unknown): results is JournalEvalResults {
  return typeof results === "object" && results !== null && "avg_score" in results;
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

// =============================================================================
// Collapsible inline detail
// =============================================================================

function formatCardField(content: string | Record<string, unknown>): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

function DetailToggle({ label, content }: { readonly label: string; readonly content: string | Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const displayText = formatCardField(content);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        {open ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        <span className="uppercase tracking-wider font-medium">{label}</span>
      </button>
      {open && (
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5 pl-3 border-l border-border/30 whitespace-pre-wrap">
          {displayText}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Timeline Entry
// =============================================================================

function TimelineEntry({
  entry,
  isLast,
}: {
  readonly entry: PipelineJournalEntry;
  readonly isLast: boolean;
}) {
  const phase = stepPhase(entry.step);
  const { Icon: StatusIcon, cls: statusCls } = statusIcon(entry.status);
  const results = entry.results;

  return (
    <div className="flex gap-3 group">
      {/* Timeline rail: dot + line */}
      <div className="flex flex-col items-center w-3 shrink-0">
        <div className={cn("w-2.5 h-2.5 rounded-full mt-1 shrink-0 ring-2 ring-background", PHASE_DOT[phase])} />
        {!isLast && <div className={cn("w-0.5 flex-1 mt-0.5", PHASE_LINE[phase])} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Row 1: step name + status + duration + time */}
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-[12px] font-semibold text-foreground truncate">
            {stepLabel(entry.step)}
          </span>
          <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", statusCls)} />
          {entry.duration && (
            <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
              {entry.duration}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0 ml-auto">
            {formatTime(entry.timestamp)}
          </span>
        </div>

        {/* Row 2: summary (compact) */}
        <p className="text-[11px] text-muted-foreground/80 leading-snug mt-1 line-clamp-2">
          {entry.summary}
        </p>

        {/* Inline badges: scores + model */}
        {(isEvalResults(results) || entry.model) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {isEvalResults(results) && results.avg_score != null && (
              <span className="text-[10px] font-semibold tabular-nums px-1.5 py-px rounded bg-emerald-500/15 text-emerald-400">
                {fmtPct(results.avg_score)}
              </span>
            )}
            {isEvalResults(results) && results.perfect_rate != null && (
              <span className="text-[10px] tabular-nums px-1.5 py-px rounded bg-muted/50 text-muted-foreground/70">
                perfect {fmtPct(results.perfect_rate)}
              </span>
            )}
            {isEvalResults(results) && results.zero_rate != null && results.zero_rate > 0 && (
              <span className="text-[10px] tabular-nums px-1.5 py-px rounded bg-red-500/15 text-red-400">
                zeros {fmtPct(results.zero_rate)}
              </span>
            )}
            {entry.model && (
              <span className="text-[10px] px-1.5 py-px rounded bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]">
                {entry.model}
              </span>
            )}
          </div>
        )}

        {/* Expandable details — inline, compact */}
        {(entry.analysis || entry.decision || entry.reason_created) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0 mt-1.5">
            {entry.analysis && <DetailToggle label="analysis" content={entry.analysis} />}
            {entry.decision && <DetailToggle label="decision" content={entry.decision} />}
            {entry.reason_created && <DetailToggle label="reason" content={entry.reason_created} />}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Grouped Entry — merges consecutive same-step entries
// =============================================================================

function GroupedTimelineEntry({
  group,
  isLast,
}: {
  readonly group: { step: string; entries: PipelineJournalEntry[] };
  readonly isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const lastEntry = group.entries[group.entries.length - 1];
  const phase = stepPhase(group.step);
  const { Icon: StatusIcon, cls: statusCls } = statusIcon(lastEntry.status);
  const results = lastEntry.results;

  return (
    <div className="flex gap-3 group">
      {/* Timeline rail */}
      <div className="flex flex-col items-center w-3 shrink-0">
        <div className={cn("w-2.5 h-2.5 rounded-full mt-1 shrink-0 ring-2 ring-background", PHASE_DOT[phase])} />
        {!isLast && <div className={cn("w-0.5 flex-1 mt-0.5", PHASE_LINE[phase])} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Header */}
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-[12px] font-semibold text-foreground truncate">
            {stepLabel(group.step)}
          </span>
          <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", statusCls)} />
          {lastEntry.duration && (
            <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">{lastEntry.duration}</span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground transition-colors ml-1 shrink-0"
          >
            {group.entries.length} steps {expanded ? "▾" : "▸"}
          </button>
          <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0 ml-auto">
            {formatTime(lastEntry.timestamp)}
          </span>
        </div>

        {/* Last entry summary (always visible) */}
        <p className="text-[11px] text-muted-foreground/80 leading-snug mt-1 line-clamp-2">
          {lastEntry.summary}
        </p>

        {/* Scores */}
        {isEvalResults(results) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {results.avg_score != null && (
              <span className="text-[10px] font-semibold tabular-nums px-1.5 py-px rounded bg-emerald-500/15 text-emerald-400">
                {fmtPct(results.avg_score)}
              </span>
            )}
            {results.perfect_rate != null && (
              <span className="text-[10px] tabular-nums px-1.5 py-px rounded bg-muted/50 text-muted-foreground/70">
                perfect {fmtPct(results.perfect_rate)}
              </span>
            )}
          </div>
        )}

        {lastEntry.model && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-px rounded bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]">
            {lastEntry.model}
          </span>
        )}

        {/* Expanded: show all sub-entries */}
        {expanded && (
          <div className="mt-2 space-y-1.5 border-l border-border/30 pl-3 ml-0.5">
            {group.entries.map((entry, i) => (
              <div key={entry.id}>
                <div className="flex items-center gap-1.5 text-muted-foreground/70">
                  <span className="text-[10px] tabular-nums w-3 shrink-0 text-right text-muted-foreground/40">{i + 1}</span>
                  <span className="text-[11px] flex-1">{entry.summary}</span>
                  <span className="text-[10px] tabular-nums shrink-0 text-muted-foreground/40">{formatTime(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Details from last entry */}
        {(lastEntry.analysis || lastEntry.decision || lastEntry.reason_created) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0 mt-1.5">
            {lastEntry.analysis && <DetailToggle label="analysis" content={lastEntry.analysis} />}
            {lastEntry.decision && <DetailToggle label="decision" content={lastEntry.decision} />}
            {lastEntry.reason_created && <DetailToggle label="reason" content={lastEntry.reason_created} />}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Date separator
// =============================================================================

function DateHeader({ date }: { readonly date: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-3 flex justify-center">
        <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
      </div>
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
        {date}
      </span>
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}

// =============================================================================
// Document View — styled React components, not raw markdown
// =============================================================================

function statusText(status: JournalEntryStatus): { label: string; cls: string } {
  switch (status) {
    case "completed": case "pass": case "succeeded":
      return { label: "Completed", cls: "text-emerald-400" };
    case "in_progress":
      return { label: "In Progress", cls: "text-blue-400" };
    case "warn":
      return { label: "Warning", cls: "text-amber-400" };
    case "fail": case "error":
      return { label: "Failed", cls: "text-red-400" };
    default:
      return { label: status, cls: "text-muted-foreground" };
  }
}

function DocField({ label, value }: { readonly label: string; readonly value: string | Record<string, unknown> }) {
  const displayText = formatCardField(value);
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed">
      <span className="text-muted-foreground/50 shrink-0 w-16 text-right">{label}</span>
      <span className="text-muted-foreground/80 whitespace-pre-wrap">{displayText}</span>
    </div>
  );
}

function DocumentEntry({ entry }: { readonly entry: PipelineJournalEntry }) {
  const phase = stepPhase(entry.step);
  const status = statusText(entry.status);
  const results = entry.results;
  const ts = new Date(entry.timestamp);
  const dateStr = isNaN(ts.getTime()) ? "" : ts.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="border-l-2 pl-3 py-3 border-border/30 hover:border-border/60 transition-colors">
      {/* Heading */}
      <div className="flex items-center gap-2">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", PHASE_DOT[phase])} />
        <h3 className="text-[13px] font-semibold text-foreground">{stepLabel(entry.step)}</h3>
        <span className={cn("text-[10px] font-medium", status.cls)}>{status.label}</span>
        {entry.duration && (
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">{entry.duration}</span>
        )}
        <span className="text-[10px] text-muted-foreground/30 tabular-nums ml-auto">{dateStr}</span>
      </div>

      {/* Fields */}
      <div className="mt-2 space-y-0.5">
        <DocField label="Summary" value={entry.summary} />
        {entry.analysis && <DocField label="Analysis" value={entry.analysis} />}
        {entry.decision && <DocField label="Decision" value={entry.decision} />}
        {entry.reason_created && <DocField label="Reason" value={entry.reason_created} />}
        {entry.model && <DocField label="Model" value={entry.model} />}
        {entry.agent && <DocField label="Agent" value={entry.agent} />}
        {entry.job_id && <DocField label="Job ID" value={entry.job_id} />}
      </div>

      {/* Scores */}
      {isEvalResults(results) && (
        <div className="flex items-center gap-2 mt-2 ml-[72px]">
          {results.avg_score != null && (
            <span className="text-[10px] font-semibold tabular-nums px-1.5 py-px rounded bg-emerald-500/15 text-emerald-400">
              avg {fmtPct(results.avg_score)}
            </span>
          )}
          {results.perfect_rate != null && (
            <span className="text-[10px] tabular-nums px-1.5 py-px rounded bg-muted/50 text-muted-foreground/70">
              perfect {fmtPct(results.perfect_rate)}
            </span>
          )}
          {results.zero_rate != null && results.zero_rate > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-px rounded bg-red-500/15 text-red-400">
              zeros {fmtPct(results.zero_rate)}
            </span>
          )}
          {results.total_rows != null && (
            <span className="text-[10px] tabular-nums text-muted-foreground/50">{results.total_rows} rows</span>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentView({ entries }: { readonly entries: readonly PipelineJournalEntry[] }) {
  return (
    <div className="divide-y divide-border/20">
      {entries.map((entry) => (
        <DocumentEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

// =============================================================================
// View Toggle
// =============================================================================

function ViewToggle({ mode, onToggle }: { readonly mode: JournalViewMode; readonly onToggle: (m: JournalViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/40">
      <button
        onClick={() => onToggle("timeline")}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors",
          mode === "timeline" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="w-3 h-3" />
        Timeline
      </button>
      <button
        onClick={() => onToggle("document")}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors",
          mode === "document" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <FileTextIcon className="w-3 h-3" />
        Document
      </button>
    </div>
  );
}

// =============================================================================
// Drop Zone
// =============================================================================

function parseJournalFile(text: string): PipelineJournal {
  const parsed = JSON.parse(text);
  if (!parsed.entries || !Array.isArray(parsed.entries)) throw new Error("Invalid journal: missing entries array");
  return parsed as PipelineJournal;
}

function JournalDropZone({ onDrop, children, hasEntries }: {
  readonly onDrop: (j: PipelineJournal) => void;
  readonly children: React.ReactNode;
  readonly hasEntries: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const counter = useRef(0);

  const onEnter = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); counter.current++; setIsDragOver(true); }, []);
  const onLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); counter.current--; if (counter.current === 0) setIsDragOver(false); }, []);
  const onOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); }, []);
  const onDropHandler = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragOver(false); counter.current = 0;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) { toast.error("Drop a .json file"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = parseJournalFile(reader.result as string);
        toast.success(`Loaded ${j.entries.length} entries from ${file.name}`);
        onDrop(j);
      } catch (err) { toast.error(`Parse error: ${err instanceof Error ? err.message : "Invalid JSON"}`); }
    };
    reader.readAsText(file);
  }, [onDrop]);

  return (
    <div className="relative h-full" onDragEnter={onEnter} onDragLeave={onLeave} onDragOver={onOver} onDrop={onDropHandler}>
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 border-2 border-dashed border-[rgb(var(--theme-500))] rounded-lg m-2">
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-[rgb(var(--theme-500))]" />
            <p className="text-sm font-medium text-foreground">Drop pipeline-journal.json</p>
          </div>
        </div>
      )}
      {!hasEntries && !isDragOver && (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">No pipeline journal</p>
            <p className="text-xs text-muted-foreground mt-1">Activity appears here when the finetune skill runs.</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Upload className="w-3 h-3" /> Drop <code className="px-1 py-0.5 rounded bg-muted text-[10px]">pipeline-journal.json</code> to preview
            </p>
          </div>
        </div>
      )}
      {hasEntries && children}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface PipelineJournalTimelineProps {
  readonly entries: readonly PipelineJournalEntry[];
  readonly isLoading?: boolean;
  readonly onDropJournal?: (journal: PipelineJournal) => void;
  readonly onRefresh?: () => void;
  readonly isLocalPreview?: boolean;
  readonly onDismissPreview?: () => void;
}

export function PipelineJournalTimeline({
  entries,
  isLoading = false,
  onDropJournal,
  onRefresh,
}: PipelineJournalTimelineProps) {
  const [viewMode, setViewMode] = useState<JournalViewMode>("timeline");
  const noopDrop = useCallback(() => {}, []);
  const handleDrop = onDropJournal ?? noopDrop;

  const dedupedEntries = useMemo(() => {
    const done = new Set(
      entries.filter((e) => e.status !== "in_progress").map((e) => `${e.step}:${e.action}`),
    );
    return entries.filter((e) => !(e.status === "in_progress" && done.has(`${e.step}:${e.action}`)));
  }, [entries]);

  // Group consecutive entries with the same step
  type StepGroup = { step: string; entries: PipelineJournalEntry[] };
  const stepGroups = useMemo(() => {
    const groups: StepGroup[] = [];
    for (const entry of dedupedEntries) {
      const last = groups[groups.length - 1];
      if (last && last.step === entry.step) {
        last.entries.push(entry);
      } else {
        groups.push({ step: entry.step, entries: [entry] });
      }
    }
    return groups;
  }, [dedupedEntries]);

  // Build display list: date headers + step groups (single or merged)
  type DisplayItem =
    | { type: "date"; date: string }
    | { type: "entry"; entry: PipelineJournalEntry; isLast: boolean }
    | { type: "group"; group: StepGroup; isLast: boolean };

  const displayItems = useMemo(() => {
    const result: DisplayItem[] = [];
    let lastDate = "";
    let globalIdx = 0;
    const totalGroups = stepGroups.length;

    stepGroups.forEach((group, gi) => {
      const firstEntry = group.entries[0];
      const date = formatDate(firstEntry.timestamp);
      if (date && date !== lastDate) {
        result.push({ type: "date", date });
        lastDate = date;
      }
      const isLast = gi === totalGroups - 1;
      if (group.entries.length === 1) {
        result.push({ type: "entry", entry: firstEntry, isLast });
      } else {
        result.push({ type: "group", group, isLast });
      }
      globalIdx += group.entries.length;
    });
    return result;
  }, [stepGroups]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        <p className="text-xs text-muted-foreground">Loading journal...</p>
      </div>
    );
  }

  return (
    <JournalDropZone onDrop={handleDrop} hasEntries={dedupedEntries.length > 0}>
      <div className="px-3 py-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Pipeline Journal ({dedupedEntries.length})
            </span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors rounded"
                title="Refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
          <ViewToggle mode={viewMode} onToggle={setViewMode} />
        </div>

        {viewMode === "timeline" ? (
          <div>
            {displayItems.map((item, i) => {
              if (item.type === "date") {
                return <DateHeader key={`date-${item.date}-${i}`} date={item.date} />;
              }
              if (item.type === "group") {
                return <GroupedTimelineEntry key={`group-${item.group.step}-${i}`} group={item.group} isLast={item.isLast} />;
              }
              return <TimelineEntry key={item.entry.id} entry={item.entry} isLast={item.isLast} />;
            })}
          </div>
        ) : (
          <DocumentView entries={dedupedEntries} />
        )}
      </div>
    </JournalDropZone>
  );
}
