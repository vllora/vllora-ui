/**
 * TopicDetailView
 *
 * Full-page topic detail shown when a topic is selected from the explorer sidebar.
 * Matches mockup: breadcrumb + title + stats header, then 2 tabs (Records / Linked Sources).
 *
 * Record rows use shared cell components from shared-record-cells.tsx
 * to ensure consistent display with UnifiedRecordTable (All Topics view).
 */

import { useState, useMemo } from "react";
import { FileText, Sparkles } from "lucide-react";
import { SimplePromptChain } from "./records-table/PromptChainCard";
import type { PromptChainLink } from "./records-table/PromptChainCard";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import type { KnowledgeSource } from "@/types/knowledge-types";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { useJobScoreColumns } from "@/hooks/useJobScoreColumns";
import type { JobColumn, RecordJobScore } from "./records-table/job-score-columns";
import {
  ScorePill,
  FallbackScorePill,
  ScoreCell,
  JobColumnHeader,
  SourcePartsCell,
  useResolvedSourceParts,
} from "./records-table/shared-record-cells";

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
  onSelectRecord,
  normalizedObjective,
}: TopicDetailViewProps) {
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
        </div>
      </div>

      {/* Prompt chain panel */}
      {promptChain.length > 0 && (
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

/** Extract user text from record data */
function extractRecordUserText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  // Support both OpenAI format (top-level messages) and vLLora format (input.messages)
  const rawMsgs = Array.isArray(d.messages)
    ? d.messages
    : ((d.input as Record<string, unknown> | undefined)?.messages ?? []);
  const inputMsgs = rawMsgs as Array<Record<string, unknown>>;
  const userMsg = inputMsgs.find(m => m.role === "user");
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
            jobColumns.map((col, i) => {
              const needsSep = i > 0 && col.type === "finetune" && jobColumns[i - 1].type === "eval";
              return (
                <th key={col.id} className={cn("px-2 py-2.5 w-[100px] text-center", needsSep && "border-l-2 border-border pl-3")}>
                  <JobColumnHeader column={col} />
                </th>
              );
            })
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
  const userText = useMemo(() => extractRecordUserText(record.data), [record.data]);
  const hasJobColumns = jobColumns.length > 0;
  const scores = useMemo(
    () => getScoresForRecord?.(record.id),
    [getScoresForRecord, record.id],
  );
  const { partRefs, resolvedParts } = useResolvedSourceParts(record, sources);
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
          {userText || <span className="text-muted-foreground/50 italic">No user message</span>}
        </span>
      </td>
      {hasJobColumns ? (
        jobColumns.map((col, i) => {
          const needsSep = i > 0 && col.type === "finetune" && jobColumns[i - 1].type === "eval";
          return (
            <td key={col.id} className={cn("px-1 py-2.5 text-center align-top", needsSep && "border-l-2 border-border pl-3")}>
              <ScoreCell jobScore={scores?.get(col.id)} />
            </td>
          );
        })
      ) : (
        <td className="px-4 py-2.5 text-center align-top">
          {fallbackScore != null ? (
            <ScorePill score={fallbackScore} />
          ) : (
            <FallbackScorePill />
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

export function LinkedSourcesTabContent({
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
                  ? `${parts.map((_p, i) => `Part ${i + 1}`).join(", ")}`
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
  readonly chain: readonly PromptChainLink[];
}) {
  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
      <SimplePromptChain chain={chain} className="px-4 py-3" />
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
