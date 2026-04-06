/**
 * PipelineJournalTimeline
 *
 * Two views of the pipeline execution journal:
 * - **Timeline**: Rich interactive timeline with status icons, collapsible sections
 * - **Document**: Continuous markdown narrative (like execution-log.md)
 *
 * Replaces LogsViewer for workflows that have a pipeline journal.
 */

import { useState, useCallback, useMemo, useRef, type DragEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Target,
  FileText,
  Network,
  Database,
  Code2,
  ShieldCheck,
  FlaskConical,
  Gauge,
  Rocket,
  BarChart3,
  IterationCw,
  ScrollText,
  List,
  FileTextIcon,
  Upload,
  X,
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
// Helpers
// =============================================================================

/** Map step names to human-readable labels */
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

/** Map step names to icons */
function stepIcon(step: string) {
  if (step.includes("objective")) return Target;
  if (step.includes("extraction")) return FileText;
  if (step.includes("topics")) return Network;
  if (step.includes("records")) return Database;
  if (step.includes("grader")) return Code2;
  if (step.includes("quality")) return ShieldCheck;
  if (step.includes("verify")) return ShieldCheck;
  if (step.includes("eval")) return FlaskConical;
  if (step.includes("difficulty") || step.includes("readiness") || step.includes("headroom")) return Gauge;
  if (step.includes("training")) return Rocket;
  if (step.includes("analysis")) return BarChart3;
  if (step.includes("iteration")) return IterationCw;
  if (step.includes("decision")) return Target;
  return ScrollText;
}

/** Status badge styling */
function statusConfig(status: JournalEntryStatus): {
  icon: typeof CheckCircle2;
  className: string;
  label: string;
} {
  switch (status) {
    case "completed":
    case "pass":
    case "succeeded":
      return { icon: CheckCircle2, className: "text-emerald-500", label: "Done" };
    case "in_progress":
      return { icon: Loader2, className: "text-blue-400 animate-spin", label: "Running" };
    case "warn":
      return { icon: AlertTriangle, className: "text-amber-400", label: "Warning" };
    case "fail":
    case "error":
      return { icon: XCircle, className: "text-red-400", label: "Failed" };
    default:
      return { icon: CheckCircle2, className: "text-muted-foreground", label: status };
  }
}

/** Format ISO timestamp to short time */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
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

/** Check if results contain eval scores */
function isEvalResults(results: unknown): results is JournalEvalResults {
  return (
    typeof results === "object" &&
    results !== null &&
    "avg_score" in results
  );
}

/** Format a score as percentage */
function fmtScore(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

// =============================================================================
// Collapsible Section
// =============================================================================

function CollapsibleField({
  label,
  content,
}: {
  readonly label: string;
  readonly content: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <div className="mt-1">
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        <span className="font-medium">{label}</span>
      </button>
      {isOpen && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 ml-4">
          {content}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Single Entry
// =============================================================================

function JournalEntry({
  entry,
}: {
  readonly entry: PipelineJournalEntry;
}) {
  const status = statusConfig(entry.status);
  const StatusIcon = status.icon;
  const StepIcon = stepIcon(entry.step);
  const results = entry.results;

  return (
    <div className="group relative flex gap-2.5 py-2 px-2 rounded-md hover:bg-muted/40 transition-colors">
      {/* Status indicator */}
      <div className="flex flex-col items-center shrink-0 pt-0.5">
        <StatusIcon className={cn("w-3.5 h-3.5", status.className)} />
        {/* Vertical connector line */}
        <div className="w-px flex-1 bg-border/50 mt-1 group-last:hidden" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: step label + duration + time */}
        <div className="flex items-center gap-1.5">
          <StepIcon className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[12px] font-medium text-foreground truncate">
            {stepLabel(entry.step)}
          </span>
          {entry.duration && (
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {entry.duration}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums ml-auto">
            {formatTime(entry.timestamp)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
          {entry.summary}
        </p>

        {/* Inline eval scores */}
        {isEvalResults(results) && (
          <div className="flex items-center gap-2 mt-1 text-[10px] tabular-nums">
            {results.avg_score != null && (
              <span className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground font-medium">
                avg {fmtScore(results.avg_score)}
              </span>
            )}
            {results.perfect_rate != null && (
              <span className="px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                perfect {fmtScore(results.perfect_rate)}
              </span>
            )}
            {results.zero_rate != null && results.zero_rate > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                zeros {fmtScore(results.zero_rate)}
              </span>
            )}
          </div>
        )}

        {/* Model badge */}
        {entry.model && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))] font-medium">
            {entry.model}
          </span>
        )}

        {/* Collapsible sections */}
        {entry.analysis && (
          <CollapsibleField label="Analysis" content={entry.analysis} />
        )}
        {entry.decision && (
          <CollapsibleField label="Decision" content={entry.decision} />
        )}
        {entry.reason_created && (
          <CollapsibleField label="Reason" content={entry.reason_created} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Document View — generates markdown from structured entries
// =============================================================================

/** Status emoji for document view */
function statusEmoji(status: JournalEntryStatus): string {
  switch (status) {
    case "completed":
    case "pass":
    case "succeeded":
      return "completed";
    case "in_progress":
      return "IN PROGRESS";
    case "warn":
      return "WARN";
    case "fail":
    case "error":
      return "FAILED";
    default:
      return status;
  }
}

/** Format timestamp for document view: "YYYY-MM-DD HH:MM" */
function formatDocTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Generate markdown string from journal entries */
function entriesToMarkdown(entries: readonly PipelineJournalEntry[]): string {
  const lines: string[] = [];

  for (const entry of entries) {
    lines.push(`## ${stepLabel(entry.step)} — ${formatDocTimestamp(entry.timestamp)}`);
    lines.push(`- **Status**: ${statusEmoji(entry.status)}`);

    if (entry.agent) {
      lines.push(`- **Agent**: ${entry.agent}`);
    }
    if (entry.duration) {
      lines.push(`- **Duration**: ${entry.duration}`);
    }
    lines.push(`- **Summary**: ${entry.summary}`);

    if (entry.reason_created) {
      lines.push(`- **Reason**: ${entry.reason_created}`);
    }
    if (entry.analysis) {
      lines.push(`- **Analysis**: ${entry.analysis}`);
    }
    if (entry.decision) {
      lines.push(`- **Decision**: ${entry.decision}`);
    }
    if (entry.model) {
      lines.push(`- **Model**: ${entry.model}`);
    }
    if (entry.job_id) {
      lines.push(`- **Job ID**: ${entry.job_id}`);
    }

    // Inline eval results
    if (isEvalResults(entry.results)) {
      const r = entry.results;
      if (r.avg_score != null) lines.push(`- **avg_score**: ${r.avg_score}`);
      if (r.perfect_rate != null) lines.push(`- **perfect_rate**: ${r.perfect_rate}`);
      if (r.zero_rate != null) lines.push(`- **zero_rate**: ${r.zero_rate}`);
      if (r.total_rows != null) lines.push(`- **total_rows**: ${r.total_rows}`);
    }

    lines.push(""); // blank line between entries
  }

  return lines.join("\n");
}

function DocumentView({ entries }: { readonly entries: readonly PipelineJournalEntry[] }) {
  const markdown = useMemo(() => entriesToMarkdown(entries), [entries]);

  return (
    <div className="p-4 prose prose-sm prose-invert max-w-none
      prose-headings:text-foreground prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1
      prose-p:text-muted-foreground prose-p:text-xs prose-p:my-0.5
      prose-li:text-muted-foreground prose-li:text-xs prose-li:my-0
      prose-ul:my-1 prose-strong:text-foreground prose-strong:font-medium"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

// =============================================================================
// View Toggle
// =============================================================================

function ViewToggle({
  mode,
  onToggle,
}: {
  readonly mode: JournalViewMode;
  readonly onToggle: (mode: JournalViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50">
      <button
        onClick={() => onToggle("timeline")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors",
          mode === "timeline"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="w-3 h-3" />
        Timeline
      </button>
      <button
        onClick={() => onToggle("document")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors",
          mode === "document"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <FileTextIcon className="w-3 h-3" />
        Document
      </button>
    </div>
  );
}

// =============================================================================
// Drop Zone — drag & drop pipeline-journal.json for local preview
// =============================================================================

/** Parse a dropped file and extract journal entries */
function parseJournalFile(text: string): PipelineJournal {
  const parsed = JSON.parse(text);
  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    throw new Error("Invalid journal: missing entries array");
  }
  return parsed as PipelineJournal;
}

function JournalDropZone({
  onDrop,
  children,
  hasEntries,
}: {
  readonly onDrop: (journal: PipelineJournal) => void;
  readonly children: React.ReactNode;
  readonly hasEntries: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      dragCounterRef.current = 0;

      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (!file.name.endsWith(".json")) {
        toast.error("Please drop a .json file (pipeline-journal.json)");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const journal = parseJournalFile(reader.result as string);
          toast.success(`Loaded ${journal.entries.length} journal entries from ${file.name}`);
          onDrop(journal);
        } catch (err) {
          toast.error(`Failed to parse journal: ${err instanceof Error ? err.message : "Invalid JSON"}`);
        }
      };
      reader.readAsText(file);
    },
    [onDrop],
  );

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 border-2 border-dashed border-[rgb(var(--theme-500))] rounded-lg m-2">
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-[rgb(var(--theme-500))]" />
            <p className="text-sm font-medium text-foreground">
              Drop pipeline-journal.json
            </p>
          </div>
        </div>
      )}

      {/* Empty state with drop hint */}
      {!hasEntries && !isDragOver && (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">No pipeline journal</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pipeline activity will appear here when the finetune skill runs.
            </p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Upload className="w-3 h-3" />
              Or drop a <code className="px-1 py-0.5 rounded bg-muted text-[10px]">pipeline-journal.json</code> to preview
            </p>
          </div>
        </div>
      )}

      {/* Actual content when entries exist */}
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
  /** Called when a journal file is dropped. Parent manages the override state. */
  readonly onDropJournal?: (journal: PipelineJournal) => void;
  /** Whether showing a locally-dropped file (shows a dismiss banner) */
  readonly isLocalPreview?: boolean;
  /** Dismiss the local preview */
  readonly onDismissPreview?: () => void;
}

export function PipelineJournalTimeline({
  entries,
  isLoading = false,
  onDropJournal,
  isLocalPreview = false,
  onDismissPreview,
}: PipelineJournalTimelineProps) {
  const [viewMode, setViewMode] = useState<JournalViewMode>("timeline");

  // Deduplicate: for same step, if there's a completed entry, skip the in_progress one
  const dedupedEntries = useMemo(() => {
    const completedSteps = new Set(
      entries
        .filter((e) => e.status !== "in_progress")
        .map((e) => `${e.step}:${e.action}`),
    );

    return entries.filter((e) => {
      if (e.status === "in_progress" && completedSteps.has(`${e.step}:${e.action}`)) {
        return false;
      }
      return true;
    });
  }, [entries]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        <p className="text-xs text-muted-foreground">Loading journal...</p>
      </div>
    );
  }

  const noopDrop = useCallback(() => {}, []);
  const handleDrop = onDropJournal ?? noopDrop;

  return (
    <JournalDropZone onDrop={handleDrop} hasEntries={dedupedEntries.length > 0}>
      <div className="p-3">
        {/* Local preview banner */}
        {isLocalPreview && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
            <Upload className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-400 flex-1">
              Previewing dropped file (not saved)
            </span>
            {onDismissPreview && (
              <button
                onClick={onDismissPreview}
                className="p-0.5 text-amber-400 hover:text-amber-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pipeline Journal ({dedupedEntries.length})
          </h3>
          <ViewToggle mode={viewMode} onToggle={setViewMode} />
        </div>

        {viewMode === "timeline" ? (
          <div className="space-y-0">
            {dedupedEntries.map((entry) => (
              <JournalEntry key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <DocumentView entries={dedupedEntries} />
        )}
      </div>
    </JournalDropZone>
  );
}
