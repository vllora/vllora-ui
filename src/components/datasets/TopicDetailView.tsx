/**
 * TopicDetailView
 *
 * Full-page topic detail shown when a topic is selected from the explorer sidebar.
 * Matches mockup: breadcrumb + title + stats header, then 2 tabs (Records / Linked Sources).
 */

import { useState, useMemo } from "react";
import { FileText, Sparkles, MessageSquare, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource, resolvePartRef } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import type { KnowledgeSource } from "@/types/knowledge-types";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { useJobScoreColumns } from "@/hooks/useJobScoreColumns";
import type { JobColumn, RecordJobScore } from "./records-table/job-score-columns";
import { JobStatusBadge } from "./shared/JobStatusBadge";

type Tab = "records" | "linked-sources";

export interface TopicDetailViewProps {
  /** The matched topic node in the hierarchy */
  readonly topicNode: TopicHierarchyNode;
  /** Ancestor nodes from root to parent (excludes the current node) */
  readonly ancestorNodes?: TopicHierarchyNode[];
  /** Records assigned to this topic and its descendants */
  readonly records: DatasetRecord[];
  /** Called when a record row is clicked */
  readonly onSelectRecord?: (recordId: string) => void;
  /** LLM-normalized "You are ..." role sentence (root prompt) */
  readonly normalizedObjective?: string;
}

/** Collect all sourceChunkRefs from a node and its descendants */
function collectAllRefs(node: TopicHierarchyNode): string[] {
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
  onSelectRecord,
  normalizedObjective,
}: TopicDetailViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("records");
  const [isPromptOpen, setIsPromptOpen] = useState(false);
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

  // Extract system prompt from the first record's data (the actual generated prompt)
  const recordSystemPrompt = useMemo(() => {
    for (const record of records) {
      const data = record.data as { input?: { messages?: Array<{ role?: string; content?: string }> } } | undefined;
      const msgs = data?.input?.messages;
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tabs + prompt toggle */}
      <div className="px-4 shrink-0 border-b border-border">
        <div className="flex items-center gap-0">
          <TabButton
            active={activeTab === "records"}
            label={`Records (${records.length})`}
            onClick={() => setActiveTab("records")}
          />
          <TabButton
            active={activeTab === "linked-sources"}
            label={`Linked Sources (${sourceCount})`}
            onClick={() => setActiveTab("linked-sources")}
          />
          {promptChain.length > 0 && (
            <button
              type="button"
              onClick={() => setIsPromptOpen(prev => !prev)}
              className={cn(
                "ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                isPromptOpen
                  ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50",
              )}
              title="View system prompt chain"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prompt</span>
            </button>
          )}
        </div>
      </div>

      {/* Prompt chain panel */}
      {isPromptOpen && promptChain.length > 0 && (
        <PromptChainPanel chain={promptChain} />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "records" ? (
          <RecordsTabContent
            records={records}
            onSelectRecord={onSelectRecord}
            jobColumns={jobColumns}
            getScoresForRecord={getScoresForRecord}
            sources={sources}
          />
        ) : (
          <LinkedSourcesTabContent groupedSources={groupedSources} />
        )}
      </div>
    </div>
  );
}

// ─── Records Tab ───

/** Extract user and assistant text from record data */
function extractRecordMessages(data: unknown): { user: string; assistant: string } {
  if (!data || typeof data !== "object") return { user: "", assistant: "" };
  const d = data as Record<string, unknown>;
  const input = d.input as Record<string, unknown> | undefined;
  const output = d.output as Record<string, unknown> | undefined;

  const inputMsgs = (input?.messages ?? []) as Array<Record<string, unknown>>;
  const userMsg = inputMsgs.find(m => m.role === "user");
  const userText = userMsg
    ? (typeof userMsg.content === "string" ? userMsg.content : JSON.stringify(userMsg.content).slice(0, 300))
    : "";

  const outputMsgs = (output?.messages ?? []) as Array<Record<string, unknown>>;
  const assistantMsg = outputMsgs.find(m => m.role === "assistant");
  let assistantText = "";
  if (assistantMsg) {
    assistantText = typeof assistantMsg.content === "string"
      ? assistantMsg.content
      : JSON.stringify(assistantMsg.content).slice(0, 300);
  } else if (typeof output?.content === "string") {
    assistantText = (output as Record<string, string>).content;
  }

  return { user: userText, assistant: assistantText };
}

function RecordsTabContent({
  records,
  onSelectRecord,
  jobColumns = [],
  getScoresForRecord,
  sources = [],
}: {
  readonly records: DatasetRecord[];
  readonly onSelectRecord?: (recordId: string) => void;
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  readonly sources?: readonly KnowledgeSource[];
}) {
  const hasJobColumns = jobColumns.length > 0;

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <Sparkles className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground/70 mb-1">No records yet</p>
        <p className="text-xs text-muted-foreground/50 max-w-xs text-center">
          Generate training data for this topic to see records here.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 bg-muted/30 sticky top-0 z-[2]">
          <th className="px-4 py-2.5 w-10">#</th>
          <th className="px-4 py-2.5">Input</th>
          {hasJobColumns ? (
            jobColumns.map((col) => (
              <th key={col.id} className="px-2 py-2.5 w-[72px] text-center">
                <ScoreColumnHeader column={col} />
              </th>
            ))
          ) : (
            <th className="px-4 py-2.5 w-16 text-center">Score</th>
          )}
          <th className="px-4 py-2.5 w-28">Source</th>
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
            sources={sources}
          />
        ))}
      </tbody>
    </table>
  );
}

function ScoreColumnHeader({ column }: { readonly column: JobColumn }) {
  const isActive = column.status === "running";
  const isQueued = column.status === "queued";

  return (
    <div className="flex flex-col items-center gap-px normal-case tracking-normal">
      <span className="text-[10px] font-medium">{column.label}</span>
      {isActive ? (
        <JobStatusBadge status="running" />
      ) : isQueued ? (
        <JobStatusBadge status="queued" />
      ) : (
        <span className="text-[8px] text-muted-foreground/40">
          {column.type === "eval" ? "evaluation" : "finetune"}
        </span>
      )}
    </div>
  );
}


function ScorePill({ score }: { readonly score: number }) {
  const colorClass = score >= 0.8
    ? "bg-emerald-500/15 text-emerald-400"
    : score >= 0.6
      ? "bg-amber-500/15 text-amber-400"
      : "bg-red-500/15 text-red-400";

  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium font-mono tabular-nums", colorClass)}>
      {score.toFixed(2)}
    </span>
  );
}

function TrendArrow({ trend }: { readonly trend: number }) {
  if (trend > 0.005) return <span className="text-[9px] text-emerald-400 font-mono">↑</span>;
  if (trend < -0.005) return <span className="text-[9px] text-red-400 font-mono">↓</span>;
  return null;
}

function ScoreCell({ jobScore }: { readonly jobScore?: RecordJobScore }) {
  if (!jobScore) return <span className="text-muted-foreground/20">—</span>;
  if (jobScore.status === "queued") return <span className="text-[10px] text-muted-foreground/30 italic">queued</span>;
  if (jobScore.status === "running") {
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="w-3 h-3 text-primary animate-spin" />
        {jobScore.score !== undefined && (
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{jobScore.score.toFixed(2)}</span>
        )}
      </span>
    );
  }
  if (jobScore.status === "failed") return <span className="text-[10px] text-red-400/60">failed</span>;
  if (jobScore.score === undefined) return <span className="text-muted-foreground/20">—</span>;

  return (
    <span className="inline-flex items-center gap-0.5">
      <ScorePill score={jobScore.score} />
      {jobScore.trend !== undefined && <TrendArrow trend={jobScore.trend} />}
    </span>
  );
}

/** Format resolved source parts for the Source column */
function SourcePartsCell({
  resolvedParts,
  unresolvedCount,
}: {
  readonly resolvedParts: readonly { source: { name: string }; part: { title?: string; extractionPath?: string } }[];
  readonly unresolvedCount: number;
}) {
  if (resolvedParts.length === 0 && unresolvedCount === 0) {
    return <span className="text-muted-foreground/20">—</span>;
  }

  if (resolvedParts.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <FileText className="w-3 h-3 shrink-0 opacity-40" />
        {unresolvedCount} part{unresolvedCount !== 1 ? "s" : ""}
      </span>
    );
  }

  // Group by source document to detect cross-document refs
  const bySource = new Map<string, string[]>();
  for (const r of resolvedParts) {
    const partLabel = r.part.title ?? r.part.extractionPath ?? "untitled";
    const existing = bySource.get(r.source.name);
    if (existing) {
      existing.push(partLabel);
    } else {
      bySource.set(r.source.name, [partLabel]);
    }
  }

  const sourceCount = bySource.size;
  const tooltip = [...bySource.entries()]
    .map(([doc, parts]) => `${doc}: ${parts.join(", ")}`)
    .join("\n");

  // Single source → show part title
  // Multiple sources → show "N docs" to indicate cross-doc refs
  const label = sourceCount === 1
    ? resolvedParts.length === 1
      ? (resolvedParts[0].part.title ?? resolvedParts[0].source.name)
      : `${resolvedParts[0].part.title ?? resolvedParts[0].source.name} +${resolvedParts.length - 1}`
    : `${sourceCount} docs · ${resolvedParts.length} parts`;

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5 max-w-[160px] truncate"
      title={tooltip}
    >
      <FileText className="w-3 h-3 shrink-0 opacity-50" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Extract source_parts from record metadata */
function getRecordSourceParts(record: DatasetRecord): string[] {
  const meta = record.metadata as Record<string, unknown> | undefined;
  const parts = meta?.source_parts ?? meta?.sourceChunkRef;
  if (Array.isArray(parts)) return parts.filter((p): p is string => typeof p === "string");
  if (typeof parts === "string") return [parts];
  return [];
}

function RecordTableRow({
  record,
  index,
  onClick,
  jobColumns = [],
  getScoresForRecord,
  sources = [],
}: {
  readonly record: DatasetRecord;
  readonly index: number;
  readonly onClick?: (id: string) => void;
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  readonly sources?: readonly KnowledgeSource[];
}) {
  const { user } = useMemo(
    () => extractRecordMessages(record.data),
    [record.data],
  );
  const hasJobColumns = jobColumns.length > 0;
  const scores = useMemo(
    () => getScoresForRecord?.(record.id),
    [getScoresForRecord, record.id],
  );
  const partRefs = useMemo(() => getRecordSourceParts(record), [record]);
  const resolvedParts = useMemo(() => {
    if (partRefs.length === 0 || sources.length === 0) return [];
    return partRefs
      .map(ref => resolvePartRef(ref, sources))
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [partRefs, sources]);
  const fallbackScore = record.evaluation?.score ?? record.evaluation?.evalScore;

  return (
    <tr
      onClick={() => onClick?.(record.id)}
      className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <td className="px-4 py-2.5 text-[11px] text-muted-foreground/50 tabular-nums align-top">
        {index}
      </td>
      <td className="px-4 py-2.5 text-xs text-foreground/80 leading-relaxed align-top">
        <span className="line-clamp-2">
          {user || <span className="text-muted-foreground/50 italic">No user message</span>}
        </span>
      </td>
      {hasJobColumns ? (
        jobColumns.map((col) => (
          <td key={col.id} className="px-1 py-2.5 text-center align-top">
            <ScoreCell jobScore={scores?.get(col.id)} />
          </td>
        ))
      ) : (
        <td className="px-4 py-2.5 text-center align-top">
          {fallbackScore != null ? (
            <ScorePill score={fallbackScore} />
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
      )}
      <td className="px-4 py-2.5 align-top">
        <SourcePartsCell resolvedParts={resolvedParts} unresolvedCount={partRefs.length} />
      </td>
    </tr>
  );
}

// ─── Linked Sources Tab ───

function LinkedSourcesTabContent({
  groupedSources,
}: {
  readonly groupedSources: Map<string, { source: { id: string; name: string }; parts: Array<{ id: string; title?: string; type: string; content?: string; extractionPath?: string }> }>;
}) {
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
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                {parts.length > 1
                  ? `${parts.map(p => `Part ${parts.indexOf(p) + 1}`).join(", ")}`
                  : `Part 1`}
                {parts[0]?.extractionPath ? ` — ${parts[0].extractionPath}` : ""}
              </p>
            </div>
          </div>

          {/* Parts with content preview */}
          {parts.map(part => (
            <div key={part.id} className="mb-3 last:mb-0">
              {parts.length > 1 && (
                <div className="text-[10px] font-medium text-muted-foreground/60 mb-1">
                  {part.title || "Untitled"}
                  {part.extractionPath ? ` · ${part.extractionPath}` : ""}
                </div>
              )}
              {part.content && (
                <p className="text-[12px] text-foreground/70 leading-relaxed line-clamp-4">
                  {part.content.slice(0, 500)}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Prompt Chain Panel ───

function PromptChainPanel({
  chain,
}: {
  readonly chain: readonly { label: string; level: "root" | "parent" | "leaf"; prompt: string }[];
}) {
  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
      <div className="flex items-stretch gap-2 px-4 py-3 overflow-x-auto">
        {chain.map((link, i) => {
          const isLeaf = link.level === "leaf";
          return (
            <div key={i} className="flex items-stretch gap-2">
              {i > 0 && (
                <div className="flex items-center">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                </div>
              )}
              <div
                className={cn(
                  "flex flex-col min-w-[180px] max-w-[280px] rounded-lg border p-2.5",
                  isLeaf
                    ? "border-[rgba(var(--theme-500),0.3)] bg-[rgba(var(--theme-500),0.05)]"
                    : "border-border/50 bg-muted/30",
                )}
              >
                <span className={cn(
                  "text-[9px] font-semibold uppercase tracking-wider mb-1",
                  isLeaf ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground/60",
                )}>
                  {link.label}
                </span>
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap line-clamp-3">
                  {link.prompt}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shared UI Components ───

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
