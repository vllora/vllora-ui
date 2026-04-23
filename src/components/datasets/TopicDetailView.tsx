/**
 * TopicDetailView
 *
 * Full-page topic detail shown when a topic is selected from the explorer sidebar.
 * Matches mockup: breadcrumb + title + stats header, then 2 tabs (Records / Linked Sources).
 *
 * Record rows use shared cell components from shared-record-cells.tsx
 * to ensure consistent display with UnifiedRecordTable (All Topics view).
 */

import { useState, useMemo, useCallback } from "react";
import { FileText, Sparkles, ExternalLink, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import type { PromptChainLink } from "./records-table/PromptChainCard";
import { LayeredPromptChain } from "./records-table/LayeredPromptChain";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { useJobScoreColumns } from "@/hooks/useJobScoreColumns";
import type { JobColumn, RecordJobScore } from "./records-table/job-score-columns";
import {
  ScorePill,
  FallbackScorePill,
  ScoreCell,
  JobColumnHeader,
  GroundTruthCell,
  getRecordGroundTruth,
  InputTextCell,
} from "./records-table/shared-record-cells";
import { ScoreStrip } from "./eval-dialog/ScoreStrip";

type Tab = "records" | "linked-sources";

export interface TopicDetailViewProps {
  /** The matched topic node in the hierarchy */
  readonly topicNode: TopicHierarchyNode;
  /** Ancestor nodes from root to parent (excludes the current node) */
  readonly ancestorNodes?: TopicHierarchyNode[];
  /** Records assigned to this topic and its descendants */
  readonly records: DatasetRecord[];
  /** Total record count from server (may exceed records.length due to pagination) */
  readonly totalRecords?: number;
  /** Called when a record row is clicked */
  readonly onSelectRecord?: (recordId: string) => void;
  /** LLM-normalized "You are ..." role sentence (root prompt) */
  readonly normalizedObjective?: string;
  /** Current page (0-indexed) */
  readonly page?: number;
  /** Total number of pages */
  readonly totalPages?: number;
  /** Callback to change page */
  readonly onPageChange?: (page: number) => void;
  /** Whether a page is currently loading */
  readonly isLoadingPage?: boolean;
}

/** Collect all sourceChunkRefs from a node and its descendants */
export function collectAllRefs(node: TopicHierarchyNode): string[] {
  const refs = [...(node.sourceChunkRefs ?? [])];
  if (node.children) {
    for (const child of node.children) {
      refs.push(...collectAllRefs(child));
    }
  }
  return refs;
}

export function TopicDetailView({
  topicNode,
  ancestorNodes = [],
  records,
  totalRecords,
  onSelectRecord,
  normalizedObjective,
  page = 0,
  totalPages = 1,
  onPageChange,
  isLoadingPage = false,
}: TopicDetailViewProps) {
  const displayTotal = totalRecords ?? records.length;
  const [activeTab, setActiveTab] = useState<Tab>("records");
  const { sources } = KnowledgeSourcesConsumer();

  // Job score columns (eval + finetune)
  const finetuneCtx = FinetuneJobsConsumer();
  const { columns: jobColumns, getScoresForRecord } = useJobScoreColumns(finetuneCtx);

  // Collect all source refs from this topic and descendants
  const allRefs = useMemo(() => collectAllRefs(topicNode), [topicNode]);
  const uniqueRefs = useMemo(() => [...new Set(allRefs)], [allRefs]);

  // Resolve refs to actual source parts grouped by source
  const groupedSources = useMemo(
    () => resolveAndGroupBySource(uniqueRefs, sources),
    [uniqueRefs, sources],
  );

  const sourceCount = groupedSources.size;
  const partsCount = uniqueRefs.length;

  // Sort records by score ascending (weakest first) — matches research
  // (Braintrust/Arize/LangSmith slice-view default) and the mockup's
  // "Sample records · lowest scoring first" pattern. Records without a
  // score fall through to the end.
  const sortedRecords = useMemo(
    () => [...records].sort(compareByScoreAsc),
    [records],
  );

  // Extract system prompt from the first record's data (the actual generated prompt)
  const recordSystemPrompt = useMemo(() => {
    for (const record of records) {
      const d = record.data as Record<string, unknown> | undefined;
      const msgs = (Array.isArray(d?.messages) ? d.messages : (d?.input as Record<string, unknown> | undefined)?.messages) as Array<{ role?: string; content?: string }> | undefined;
      if (!msgs) continue;
      const sysMsg = msgs.find(m => m.role === "system");
      if (sysMsg?.content) return sysMsg.content;
    }
    return null;
  }, [records]);

  // Build prompt chain: root system prompt → parent topics → current topic
  const promptChain = useMemo(() => {
    const chain: { label: string; level: "root" | "parent" | "leaf"; prompt: string }[] = [];

    // Root: use normalizedObjective or fall back to record's system prompt
    const rootPrompt = normalizedObjective || recordSystemPrompt;
    if (rootPrompt) {
      chain.push({ label: "Root Prompt", level: "root", prompt: rootPrompt });
    }

    // Ancestors: use description/normalizedPromptSegment or topic name as context
    for (const ancestor of ancestorNodes) {
      const prompt = ancestor.description || ancestor.normalizedPromptSegment || `Specialize in: ${ancestor.name}`;
      chain.push({ label: ancestor.name, level: "parent", prompt });
    }

    // Current topic (leaf)
    const leafPrompt = topicNode.description || topicNode.normalizedPromptSegment || `Focus on: ${topicNode.name}`;
    chain.push({ label: topicNode.name, level: "leaf", prompt: leafPrompt });

    return chain;
  }, [normalizedObjective, ancestorNodes, topicNode, recordSystemPrompt]);

  const hasPagination = totalPages > 1 && onPageChange;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topic hero — mirrors the `hier-inspect` panel from the workflow
          redesign mock: breadcrumb + description + 4-metric grid
          (Records / Avg score / Sources / Parts) + "Sources linked" pills.
          Research alignment: Braintrust/Arize/LangSmith all lead with a
          slice-scoped stat header; the avg-chip-only header buried the
          comparison signal users need. */}
      <TopicHero
        topicNode={topicNode}
        records={records}
        sourceCount={sourceCount}
        partsCount={partsCount}
        groupedSources={groupedSources}
      />
      {/* Tabs + prompt toggle */}
      <div className="px-4 shrink-0 border-b border-border">
        <div className="flex items-center gap-0">
          <TabButton
            active={activeTab === "records"}
            label={`Records (${displayTotal})`}
            onClick={() => setActiveTab("records")}
          />
          <TabButton
            active={activeTab === "linked-sources"}
            label={`Linked Sources (${sourceCount})`}
            onClick={() => setActiveTab("linked-sources")}
          />
        </div>
      </div>

      {/* Prompt chain panel */}
      {promptChain.length > 0 && (
        <PromptChainPanel chain={promptChain} />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoadingPage && (
          <div className="absolute inset-0 bg-background/60 z-10 flex items-center justify-center">
            <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
          </div>
        )}
        {activeTab === "records" ? (
          <RecordsTabContent
            records={sortedRecords}
            onSelectRecord={onSelectRecord}
            jobColumns={jobColumns}
            getScoresForRecord={getScoresForRecord}
          />
        ) : (
          <LinkedSourcesTabContent groupedSources={groupedSources} />
        )}
      </div>

      {/* Pagination controls */}
      {hasPagination && activeTab === "records" && (
        <div className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between text-xs text-muted-foreground bg-background">
          <span className="tabular-nums">
            Page {page + 1} of {totalPages} ({displayTotal} records)
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {generatePageNumbers(page, totalPages).map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-1">...</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p as number)}
                  className={cn(
                    "w-7 h-7 rounded border transition-colors tabular-nums",
                    p === page
                      ? "border-[rgb(var(--theme-500))] bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {(p as number) + 1}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Records Tab ───

/**
 * Extract the **last** user message from the record's conversation.
 *
 * Trace-derived records are multi-turn: the first user turn is often a
 * generic greeting ("Hi, I need help with…") that repeats across many
 * records. The last user turn is the one the assistant's evaluated reply
 * actually answers, so it's the discriminating signal for scanning a
 * topic's records. `findLast` (vs `find`) picks it correctly in both the
 * single-turn and multi-turn cases.
 */
function extractRecordUserText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  // Support both OpenAI format (top-level messages) and vLLora format (input.messages)
  const rawMsgs = Array.isArray(d.messages)
    ? d.messages
    : ((d.input as Record<string, unknown> | undefined)?.messages ?? []);
  const inputMsgs = rawMsgs as Array<Record<string, unknown>>;
  // findLast keeps us correct for both single-turn (first === last) and
  // multi-turn conversations.
  const userMsg = [...inputMsgs].reverse().find((m) => m.role === "user");
  if (!userMsg) return "";
  return typeof userMsg.content === "string"
    ? userMsg.content
    : JSON.stringify(userMsg.content).slice(0, 300);
}

export function RecordsTabContent({
  records,
  onSelectRecord,
  jobColumns = [],
  getScoresForRecord,
}: {
  readonly records: DatasetRecord[];
  readonly onSelectRecord?: (recordId: string) => void;
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
}) {
  const hasJobColumns = jobColumns.length > 0;
  const hasGroundTruth = useMemo(
    () => records.some((r) => getRecordGroundTruth(r) != null),
    [records],
  );

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <Sparkles className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground/70 mb-1">No records yet</p>
        <p className="text-xs text-muted-foreground/50 max-w-xs text-center">
          If this is a category, click a specific skill below to see its teaching examples.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-left border-collapse text-xs table-fixed">
      <thead>
        <tr className="border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 bg-muted/30 sticky top-0 z-[2]">
          <th className="px-4 py-2 w-10">#</th>
          <th className="px-4 py-2 w-[40%]">Input · last user turn</th>
          {hasGroundTruth && <th className="px-4 py-2 w-[40%]">Ground truth</th>}
          {hasJobColumns ? (
            jobColumns.map((col, i) => {
              const needsSep = i > 0 && col.type === "finetune" && jobColumns[i - 1].type === "eval";
              return (
                <th key={col.id} className={cn("px-2 py-2 w-[100px] text-center", needsSep && "border-l-2 border-border pl-3")}>
                  <JobColumnHeader column={col} />
                </th>
              );
            })
          ) : (
            <th className="px-4 py-2 w-16 text-center">Score</th>
          )}
        </tr>
      </thead>
      <tbody>
        {records.map((record, idx) => (
          <RecordTableRow
            key={record.id}
            record={record}
            index={idx + 1}
            onClick={onSelectRecord}
            jobColumns={jobColumns}
            getScoresForRecord={getScoresForRecord}
            showGroundTruth={hasGroundTruth}
          />
        ))}
      </tbody>
    </table>
  );
}

function RecordTableRow({
  record,
  index,
  onClick,
  jobColumns = [],
  getScoresForRecord,
  showGroundTruth = false,
}: {
  readonly record: DatasetRecord;
  readonly index: number;
  readonly onClick?: (id: string) => void;
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  readonly showGroundTruth?: boolean;
}) {
  const userText = useMemo(() => extractRecordUserText(record.data), [record.data]);
  const hasJobColumns = jobColumns.length > 0;
  const groundTruthText = useMemo(
    () => (showGroundTruth ? getRecordGroundTruth(record) : null),
    [record, showGroundTruth],
  );
  const scores = useMemo(
    () => getScoresForRecord?.(record.id),
    [getScoresForRecord, record.id],
  );
  const fallbackScore = record.evaluation?.score ?? record.evaluation?.evalScore;

  // Compact single-line rows — matches the redesign mock's `.tbl .row` density.
  // Source info moves into the drawer ("Source context" section) instead of
  // being a per-row column: for a single-topic slice the sources are repetitive
  // and already summarised by the hero's "Sources linked" pills.
  return (
    <tr
      onClick={() => onClick?.(record.id)}
      className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <td className="px-4 py-1.5 text-[11px] text-muted-foreground/50 tabular-nums align-middle">
        {index}
      </td>
      <td className="px-4 py-1.5 align-middle max-w-0">
        <InputTextCell text={userText} emptyLabel="No user message" singleLine />
      </td>
      {showGroundTruth && (
        <td className="px-4 py-1.5 align-middle max-w-0">
          <GroundTruthCell text={groundTruthText} />
        </td>
      )}
      {hasJobColumns ? (
        jobColumns.map((col, i) => {
          const needsSep = i > 0 && col.type === "finetune" && jobColumns[i - 1].type === "eval";
          return (
            <td key={col.id} className={cn("px-1 py-1.5 text-center align-middle", needsSep && "border-l-2 border-border pl-3")}>
              <ScoreCell jobScore={scores?.get(col.id)} />
            </td>
          );
        })
      ) : (
        <td className="px-4 py-1.5 text-center align-middle">
          {fallbackScore != null ? (
            <ScorePill score={fallbackScore} />
          ) : (
            <FallbackScorePill />
          )}
        </td>
      )}
    </tr>
  );
}

// ─── Linked Sources Tab ───

export function LinkedSourcesTabContent({
  groupedSources,
}: {
  readonly groupedSources: Map<string, { source: { id: string; name: string }; parts: Array<{ id: string; title?: string; type: string; content?: string; extractionPath?: string }> }>;
}) {
  const navigateToPart = useCallback((sourceId: string, partId: string) => {
    // Navigate to the source doc view focused on this part
    window.dispatchEvent(new CustomEvent("vllora_switch_view", {
      detail: { viewMode: "sources", sourceId },
    }));
    // After a tick, emit focus on the specific part
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("vllora_navigate_to_part", {
        detail: { sourceId, partId },
      }));
    }, 100);
  }, []);

  if (groupedSources.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <FileText className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground/70 mb-1">No linked sources</p>
        <p className="text-xs text-muted-foreground/50 max-w-xs text-center">
          Link knowledge source parts to this topic to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {[...groupedSources.values()].map(({ source, parts }) => (
        <div key={source.id} className="bg-card border border-border rounded-xl p-4">
          {/* Source header */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-semibold text-foreground truncate">{source.name}</h4>
              <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                {parts.length} {parts.length === 1 ? "part" : "parts"} linked
              </p>
            </div>
          </div>

          {/* Parts list */}
          <div className="space-y-2">
            {parts.map(part => {
              // Strip the title from content start to avoid duplication
              const title = part.title || "Untitled";
              const rawContent = part.content || "";
              const contentWithoutTitle = rawContent.startsWith(title)
                ? rawContent.slice(title.length).replace(/^\s*\n*/, "")
                : rawContent;
              const preview = contentWithoutTitle.slice(0, 300).replace(/\n+/g, " ").trim();

              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => navigateToPart(source.id, part.id)}
                  className="w-full text-left pl-3 py-1.5 hover:bg-muted/20 transition-colors rounded group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-foreground/80 group-hover:text-[rgb(var(--theme-500))] transition-colors">{title}</span>
                    {part.type === "table" && (
                      <span className="text-[8px] px-1 py-px rounded bg-amber-500/10 text-amber-400 font-semibold uppercase">table</span>
                    )}
                    <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors ml-auto shrink-0" />
                  </div>
                  {preview && (
                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed mt-0.5 line-clamp-2">
                      {preview}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Topic Hero (hier-inspect panel from mock) ───

/** Pick an evaluation score off a record (prefer running avg, fall back to latest). */
function pickRecordScore(record: DatasetRecord): number | null {
  const ev = record.evaluation;
  if (!ev) return null;
  const candidate = ev.dryRunAvg ?? ev.evalScore ?? ev.score;
  return typeof candidate === "number" ? candidate : null;
}

function scoreTone(avg: number | null): string {
  if (avg == null) return "text-muted-foreground";
  if (avg >= 0.85) return "text-emerald-300";
  if (avg >= 0.7) return "text-amber-300";
  return "text-rose-300";
}

interface TopicHeroProps {
  readonly topicNode: TopicHierarchyNode;
  readonly records: readonly DatasetRecord[];
  readonly sourceCount: number;
  readonly partsCount: number;
  readonly groupedSources: Map<
    string,
    { source: { id: string; name: string }; parts: Array<{ id: string; title?: string; type: string }> }
  >;
}

/**
 * Slice-scoped hero — minimal to avoid duplicating the tab breadcrumb + record
 * count chip already rendered by RecordsSectionHeader above this component.
 *
 * Layout:
 *   1. Description paragraph (if present)
 *   2. Avg score chip + Sources summary (inline)
 *   3. Source pills (truncated to 4 + overflow)
 *   4. Sources linked — source pills with part counts
 *
 * Research alignment: every eval-first platform (Braintrust, Arize, LangSmith)
 * leads a slice view with an aggregate stat header so users can judge "is
 * this slice dragging the dataset down?" before scanning rows.
 */
function TopicHero({
  topicNode,
  records,
  sourceCount,
  partsCount,
  groupedSources,
}: TopicHeroProps) {
  const scores = records.map(pickRecordScore).filter((s): s is number => s != null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  // Drop the slug breadcrumb + "Records" tile: both duplicate the tab
  // breadcrumb and the "N records" chip rendered by RecordsSectionHeader
  // directly above this component. Keep only the signals unique to this
  // slice — avg score (with tone), and the source / parts summary.
  const pillSources = [...groupedSources.values()].slice(0, 4);
  const hiddenSources = Math.max(0, groupedSources.size - pillSources.length);

  const hasDescription = !!topicNode.description;
  const hasAvgScore = avgScore != null;
  const hasSources = sourceCount > 0;

  if (!hasDescription && !hasAvgScore && !hasSources) {
    return null;
  }

  return (
    <div className="border-b border-border shrink-0 bg-background px-4 py-3 space-y-2.5">
      {hasDescription && (
        <p className="max-w-3xl text-[12.5px] leading-[1.55] text-foreground/85">
          {topicNode.description}
        </p>
      )}

      {(hasAvgScore || hasSources) && (
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          {hasAvgScore && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
                Avg score
              </span>
              <span
                className={cn(
                  "font-mono text-[13px] font-semibold tabular-nums",
                  scoreTone(avgScore),
                )}
              >
                {avgScore.toFixed(2)}
              </span>
            </span>
          )}
          {hasSources && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
                Sources
              </span>
              <span className="font-mono text-[13px] font-semibold text-foreground tabular-nums">
                {sourceCount}
              </span>
              <span className="text-muted-foreground/60">
                · {partsCount} {partsCount === 1 ? "part" : "parts"}
              </span>
            </span>
          )}
        </div>
      )}

      {hasSources && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pillSources.map(({ source, parts }) => (
            <span
              key={source.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-0.5 text-[10.5px] text-foreground/80"
              title={parts.map((p) => p.title ?? p.id).join(", ")}
            >
              <FileText className="h-2.5 w-2.5 text-muted-foreground/60" />
              <span className="font-mono text-[10.5px]">{source.name}</span>
              <span className="text-muted-foreground/50">
                · {parts.length} {parts.length === 1 ? "part" : "parts"}
              </span>
            </span>
          ))}
          {hiddenSources > 0 && (
            <span className="text-[10.5px] text-muted-foreground/60">
              +{hiddenSources} more
            </span>
          )}
        </div>
      )}

      {/* Score distribution — collapsible. Only surfaces when the topic has
          ≥ 3 scored records, otherwise the histogram is noise. Reuses
          ScoreStrip (same component rendered by HealthRow + DryRunActivityView)
          so the shape/colors/bins stay consistent with the overview. */}
      {scores.length >= 3 && (
        <TopicDistributionStrip scores={scores} mean={avgScore ?? undefined} />
      )}
    </div>
  );
}

/** Collapsible score-distribution strip under the topic hero. */
function TopicDistributionStrip({
  scores,
  mean,
}: {
  readonly scores: readonly number[];
  readonly mean?: number;
}) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <Chevron className="h-3 w-3" />
        Distribution
        <span className="text-muted-foreground/60">· {scores.length} scored records</span>
      </button>
      {open && (
        <div className="rounded-md border border-border/60 bg-zinc-900/30 p-3">
          <ScoreStrip scores={[...scores]} mean={mean} />
        </div>
      )}
    </div>
  );
}

/**
 * Sort comparator: records with lower scores first, unscored records last.
 * Extracted so we can share it between the table render and the eventual
 * "lowest scoring first" sample list.
 */
function compareByScoreAsc(a: DatasetRecord, b: DatasetRecord): number {
  const sa = pickRecordScore(a);
  const sb = pickRecordScore(b);
  if (sa == null && sb == null) return 0;
  if (sa == null) return 1;
  if (sb == null) return -1;
  return sa - sb;
}

// ─── Prompt Chain Panel ───

type PromptView = "full" | "chain";

/**
 * Always-visible prompt panel with two modes:
 *   - "full"  (default) — layers concatenated into a single mono block,
 *     mirroring what the model actually sees at generation time.
 *   - "chain" — per-layer breakdown via `LayeredPromptChain` so users can
 *     see *where* each part of the prompt comes from (root / ancestors /
 *     leaf).
 */
function PromptChainPanel({
  chain,
}: {
  readonly chain: readonly PromptChainLink[];
}) {
  // Collapsed by default — user's primary goal on this tab is scanning
  // records. One click opens the panel; full prompt also lives in the
  // record drawer per-record, so this header is a quick reference, not
  // required reading.
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PromptView>("full");
  if (chain.length === 0) return null;
  const leaf = chain[chain.length - 1];
  const fullPrompt = chain.map((l) => l.prompt).join("\n\n");
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/20"
      >
        <Chevron className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          System prompt
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          · {chain.length} layer{chain.length === 1 ? "" : "s"} · active:{" "}
          <span className="text-emerald-300">{leaf.label}</span>
        </span>
      </button>
      {open && (
        <>
          <div className="flex items-center gap-2 px-4 pb-1">
            <div className="ml-auto inline-flex rounded border border-border/60 bg-muted/30 p-0.5">
              <PromptViewButton
                active={view === "full"}
                onClick={() => setView("full")}
                label="Full prompt"
              />
              <PromptViewButton
                active={view === "chain"}
                onClick={() => setView("chain")}
                label="Prompt chain"
              />
            </div>
          </div>
          <div className="px-4 pb-3 pt-2">
            {view === "full" ? (
              <FullPromptView text={fullPrompt} />
            ) : (
              <LayeredPromptChain chain={chain} hideHeader />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PromptViewButton({
  active,
  onClick,
  label,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-semibold transition-colors",
        active
          ? "bg-emerald-500/15 text-emerald-300"
          : "text-muted-foreground/70 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** Collapsed preview of the merged prompt — expands on click. */
function FullPromptView({ text }: { readonly text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const PREVIEW = 320;
  // Collapse runs of 3+ blank lines to 1 so concatenated layers don't
  // produce huge gaps when the source prompts already end with \n.
  const compact = text.replace(/\n{3,}/g, "\n\n");
  const truncated = compact.length > PREVIEW;
  const display = expanded || !truncated ? compact : `${compact.slice(0, PREVIEW).trim()}…`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(compact);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context or user denied) — swallow.
    }
  };

  return (
    <div className="relative rounded-md border border-border/60 bg-zinc-900/30">
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied" : "Copy prompt"}
        className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 items-center gap-1 rounded border border-border/60 bg-background/80 px-1.5 text-[10px] text-muted-foreground/80 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> Copy
          </>
        )}
      </button>
      <pre
        className={cn(
          "overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 pr-16 font-mono text-[11px] leading-[1.45] text-foreground/90",
          expanded ? "max-h-[320px]" : "max-h-[140px]",
        )}
      >
        {display}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-border/40 py-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all (${compact.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}

// ─── Shared UI Components ───

/** Generate page numbers with ellipsis for compact pagination */
function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | "...")[] = [0];
  const start = Math.max(1, current - 1);
  const end = Math.min(total - 2, current + 1);
  if (start > 1) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 2) pages.push("...");
  pages.push(total - 1);
  return pages;
}

function TabButton({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-[rgb(var(--theme-500))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
