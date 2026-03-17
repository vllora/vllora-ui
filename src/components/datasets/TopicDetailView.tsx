/**
 * TopicDetailView
 *
 * Full-page topic detail shown when a topic is selected from the explorer sidebar.
 * Matches mockup: breadcrumb + title + stats header, then 2 tabs (Records / Linked Sources).
 */

import { useState, useMemo } from "react";
import { FileText, Sparkles, MessageSquare, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import type { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";

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
          <RecordsTabContent records={records} onSelectRecord={onSelectRecord} />
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
}: {
  readonly records: DatasetRecord[];
  readonly onSelectRecord?: (recordId: string) => void;
}) {
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
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          <th className="px-4 py-2 w-10">#</th>
          <th className="px-4 py-2 w-[35%]">Input</th>
          <th className="px-4 py-2">Output</th>
          <th className="px-4 py-2 w-16 text-right">Score</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record, idx) => (
          <RecordTableRow
            key={record.id}
            record={record}
            index={idx + 1}
            onClick={onSelectRecord}
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
}: {
  readonly record: DatasetRecord;
  readonly index: number;
  readonly onClick?: (id: string) => void;
}) {
  const { user, assistant } = useMemo(
    () => extractRecordMessages(record.data),
    [record.data],
  );
  const score = record.evaluation?.score ?? record.evaluation?.evalScore;

  return (
    <tr
      onClick={() => onClick?.(record.id)}
      className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <td className="px-4 py-2.5 text-[11px] text-muted-foreground/50 tabular-nums align-top">
        {index}
      </td>
      <td className="px-4 py-2.5 text-xs text-foreground leading-relaxed align-top">
        <span className="line-clamp-2">
          {user || <span className="text-muted-foreground/50 italic">No user message</span>}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground/70 leading-relaxed align-top">
        <span className="line-clamp-2">{assistant}</span>
      </td>
      <td className="px-4 py-2.5 text-right align-top">
        {score != null ? (
          <span className={cn(
            "text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded",
            score >= 0.8 ? "text-emerald-400" : score >= 0.6 ? "text-amber-400" : "text-red-400",
          )}>
            {score.toFixed(2)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/30">—</span>
        )}
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
            <div key={i} className="flex items-center gap-2">
              {i > 0 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
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
