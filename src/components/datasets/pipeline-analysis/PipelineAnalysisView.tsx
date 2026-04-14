/**
 * PipelineAnalysisView
 *
 * Shows pipeline reasoning as a timeline of decision cards.
 * Each step has: status badge + summary (always visible),
 * expandable observation/analysis/decision/evidence card,
 * and before/after comparison tables.
 *
 * Data comes from PipelineJournalContext (journal entries with
 * decision card fields added by the skill at each step).
 */

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Brain,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PipelineJournalConsumer } from "@/contexts/PipelineJournalContext";
import type { PipelineJournalEntry, JournalEntryStatus } from "@/types/pipeline-journal-types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Accessible step labels — plain language, no jargon */
const STEP_LABELS: Record<string, string> = {
  step_1_objective: "Set Up Project",
  step_2_extraction: "Read Source Materials",
  step_2c_trace_analysis: "Analyze Real Conversations",
  step_3_topics: "Organize Skills",
  step_4_generation: "Create Teaching Examples",
  step_5_grader: "Set Up Quality Checker",
  step_5_5_validate: "Validate Examples",
  step_6_verify: "Verify Everything",
  step_7_eval: "Test Run",
  step_8_training: "Train Your Model",
  step_8_analyze: "Analyze Results",
  step_9_iterate: "Improve & Retry",
};

/** Group journal entries into logical pipeline steps. */
function groupEntriesIntoSteps(entries: readonly PipelineJournalEntry[]) {
  const steps: Array<{
    stepName: string;
    label: string;
    status: JournalEntryStatus;
    timestamp: string;
    summary: string;
    entries: PipelineJournalEntry[];
    hasDecisionCard: boolean;
  }> = [];

  const stepMap = new Map<string, PipelineJournalEntry[]>();
  for (const entry of entries) {
    const key = entry.step;
    if (!stepMap.has(key)) {
      stepMap.set(key, []);
    }
    stepMap.get(key)!.push(entry);
  }

  for (const [stepName, stepEntries] of stepMap) {
    // Use the last entry's status as the step status
    const lastEntry = stepEntries[stepEntries.length - 1]!;
    // Find the best summary (prefer completed entry's summary)
    const completedEntry = stepEntries.find(
      (e) => e.status === "completed" || e.status === "pass",
    );
    const summaryEntry = completedEntry ?? lastEntry;

    const hasDecisionCard = stepEntries.some(
      (e) => e.observation || e.analysis || e.decision || e.evidence,
    );

    // Human-readable label (accessible, non-jargon)
    const label = STEP_LABELS[stepName]
      ?? (stepName
        .replace(/^step_\d+_?/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        || stepName);

    steps.push({
      stepName,
      label,
      status: lastEntry.status,
      timestamp: stepEntries[0]!.timestamp,
      summary: summaryEntry.summary,
      entries: stepEntries,
      hasDecisionCard,
    });
  }

  return steps;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFieldText(value: string | Record<string, unknown> | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

// ─── Status Icons ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { readonly status: JournalEntryStatus }) {
  switch (status) {
    case "completed":
    case "pass":
    case "succeeded":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "warn":
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case "fail":
    case "error":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    default:
      return <div className="w-4 h-4 rounded-full bg-zinc-600" />;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PipelineAnalysisView() {
  const { entries, hasJournal, isLoading } = PipelineJournalConsumer();

  const steps = useMemo(
    () => (hasJournal ? groupEntriesIntoSteps(entries) : []),
    [entries, hasJournal],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading pipeline analysis...
      </div>
    );
  }

  if (!hasJournal) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p>No pipeline analysis available</p>
          <p className="text-xs mt-1">
            Run the finetune skill to generate step-by-step analysis
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/60 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-violet-500/15 p-2 text-violet-400">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Pipeline Analysis</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {steps.length} steps &middot; Reasoning and decisions at each stage
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-1">
          {steps.map((step, i) => (
            <StepCard key={step.stepName} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step Card ───────────────────────────────────────────────────────────────

function StepCard({
  step,
  isLast,
}: {
  readonly step: ReturnType<typeof groupEntriesIntoSteps>[number];
  readonly isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Find the entry with the most decision card data
  const cardEntry = step.entries.find(
    (e) => e.observation || e.analysis || e.decision || e.evidence,
  );

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      {!isLast && (
        <div className="absolute left-[7px] top-8 bottom-0 w-px bg-border/50" />
      )}

      {/* Step header (always visible — Tier 1) */}
      <button
        onClick={() => step.hasDecisionCard && setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-start gap-3 py-2.5 px-2 rounded-lg text-left transition-colors",
          step.hasDecisionCard && "hover:bg-muted/30 cursor-pointer",
          !step.hasDecisionCard && "cursor-default",
          isExpanded && "bg-muted/20",
        )}
      >
        <StatusIcon status={step.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{step.label}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatTimestamp(step.timestamp)}
            </span>
            {step.hasDecisionCard && (
              <span className="text-[10px] text-muted-foreground">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 inline" />
                ) : (
                  <ChevronRight className="w-3 h-3 inline" />
                )}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {step.summary}
          </p>
        </div>
      </button>

      {/* Decision card (expanded — Tier 2) */}
      {isExpanded && cardEntry && (
        <div className="ml-7 mb-3 mt-1 border border-border/50 rounded-lg bg-muted/10 overflow-hidden">
          {cardEntry.observation && (
            <CardSection
              icon={<Eye className="w-3.5 h-3.5 text-blue-400" />}
              title="Observation"
              content={cardEntry.observation}
            />
          )}
          {cardEntry.analysis && (
            <CardSection
              icon={<Brain className="w-3.5 h-3.5 text-violet-400" />}
              title="Analysis"
              content={cardEntry.analysis}
            />
          )}
          {cardEntry.decision && (
            <CardSection
              icon={<Lightbulb className="w-3.5 h-3.5 text-amber-400" />}
              title="Decision"
              content={cardEntry.decision}
            />
          )}
          {cardEntry.evidence && (
            <EvidenceSection evidence={cardEntry.evidence} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card Sections ───────────────────────────────────────────────────────────

function CardSection({
  icon,
  title,
  content,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly content: string | Record<string, unknown>;
}) {
  const text = formatFieldText(content);
  return (
    <div className="px-4 py-3 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

function EvidenceSection({
  evidence,
}: {
  readonly evidence: Record<string, unknown>;
}) {
  // Try to render before/after comparison if present
  const beforeAfter = evidence.before_after ?? evidence.beforeAfter ?? null;
  const before = beforeAfter
    ? (beforeAfter as Record<string, unknown>).before
    : evidence.before;
  const after = beforeAfter
    ? (beforeAfter as Record<string, unknown>).after
    : evidence.after;

  if (before && after) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-zinc-800/50 p-2.5">
            <span className="text-[10px] font-medium text-muted-foreground block mb-1">Before</span>
            {renderMetrics(before as Record<string, unknown>)}
          </div>
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2.5">
            <span className="text-[10px] font-medium text-emerald-500 block mb-1">After</span>
            {renderMetrics(after as Record<string, unknown>)}
          </div>
        </div>
      </div>
    );
  }

  // Fallback: render all evidence fields as key-value pairs
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evidence
        </span>
      </div>
      {renderMetrics(evidence)}
    </div>
  );
}

function renderMetrics(obj: Record<string, unknown>) {
  return (
    <div className="space-y-0.5">
      {Object.entries(obj).map(([key, value]) => (
        <div key={key} className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
          <span className="font-mono text-foreground/80">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
