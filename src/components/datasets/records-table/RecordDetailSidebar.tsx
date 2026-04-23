/**
 * RecordDetailSidebar
 *
 * Redesigned sheet/drawer for viewing record details.
 * Layout: Header → Topic breadcrumb → Scores (eval/train split) →
 *         Conversation (system + user) → Source Context → Details grid.
 */

import { useMemo, useState } from "react";
import { Trash2, ChevronLeft, ChevronRight, Pencil, FileText, Wrench, MessageSquare, Info, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import type { AvailableTopic } from "../record-utils";
import type { JobColumn, RecordJobScore } from "./job-score-columns";
import { estimateTokens, countTurns } from "./cells/StatsBadge";
import {
  SourcePartsCell,
  useResolvedSourceParts,
  getRecordGroundTruth,
} from "./shared-record-cells";
import { QueryOriginBadge, getQueryOrigin } from "./cells/QueryOriginBadge";

// ─── Types ───

interface RecordDetailSidebarProps {
  readonly record: DatasetRecord | null;
  readonly onClose: () => void;
  readonly availableTopics?: AvailableTopic[];
  readonly onUpdateTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  readonly onDelete?: (recordId: string) => void;
  readonly onSave?: (recordId: string, data: unknown) => Promise<void>;
  readonly records?: DatasetRecord[];
  readonly onNavigate?: (recordId: string) => void;
  readonly jobColumns?: readonly JobColumn[];
  readonly getScoresForRecord?: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  /** Topic hierarchy for building prompt chain in conversation section */
  readonly topicHierarchy?: TopicHierarchyNode[];
  /** Root system prompt (dataset objective) */
  readonly normalizedObjective?: string;
}

// ─── Main Component ───

export function RecordDetailSidebar({
  record,
  onClose,
  availableTopics = [],
  onDelete,
  records,
  onNavigate,
  jobColumns,
  getScoresForRecord,
  topicHierarchy,
  normalizedObjective,
}: RecordDetailSidebarProps) {
  const topicPath = useMemo(() => {
    if (!record?.topic) return null;
    const topic = availableTopics.find((t) => t.id === record.topic);
    return topic?.path || [record.topic];
  }, [record?.topic, availableTopics]);

  const navInfo = useMemo(() => {
    if (!record || !records || records.length === 0) return null;
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx === -1) return null;
    return { index: idx, total: records.length };
  }, [record, records]);

  const scores = useMemo(() => {
    if (!record || !getScoresForRecord) return null;
    return getScoresForRecord(record.id);
  }, [record, getScoresForRecord]);

  const messages = useMemo(() => {
    if (!record) return [];
    return extractMessages(record.data);
  }, [record]);

  const toolDefinitions = useMemo(() => {
    if (!record?.data || typeof record.data !== "object") return [];
    const d = record.data as Record<string, unknown>;
    return Array.isArray(d.tools) ? d.tools as Record<string, unknown>[] : [];
  }, [record]);

  // Build full system prompt by composing hierarchy chain into a single message
  const composedMessages = useMemo(() => {
    if (!record?.topic || !topicHierarchy || messages.length === 0) return messages;

    const findPath = (nodes: TopicHierarchyNode[], trail: TopicHierarchyNode[]): TopicHierarchyNode[] | null => {
      for (const node of nodes) {
        const nodeId = node.id || node.name;
        if (nodeId === record.topic || node.name === record.topic) {
          return [...trail, node];
        }
        if (node.children?.length) {
          const result = findPath(node.children, [...trail, node]);
          if (result) return result;
        }
      }
      return null;
    };

    const path = findPath(topicHierarchy, []);
    if (!path || path.length === 0) return messages;

    // Compose full system prompt from root + hierarchy nodes
    const systemMsg = messages.find(m => m.role === "system");
    const rootPrompt = normalizedObjective || systemMsg?.content || "";
    const segments = path.map(n => n.description || n.normalizedPromptSegment || `Specialize in: ${n.name}`);
    const fullSystemPrompt = [rootPrompt, ...segments].filter(Boolean).join(" ");

    // Replace raw system message with composed one, keep other messages
    return messages.map(m =>
      m.role === "system" ? { ...m, content: fullSystemPrompt } : m,
    );
  }, [record?.topic, topicHierarchy, normalizedObjective, messages]);

  // Resolve source_parts refs (same logic as table rows)
  const { sources } = KnowledgeSourcesConsumer();
  const { partRefs, resolvedParts } = useResolvedSourceParts(
    record ?? ({ metadata: {} } as DatasetRecord),
    sources,
  );
  // Count unique source *documents* (not parts) — avoids confusion with row's part count
  const uniqueSourceCount = useMemo(() => {
    const sourceIds = new Set(resolvedParts.map(r => r.source.id));
    return sourceIds.size;
  }, [resolvedParts]);

  return (
    <Sheet open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] p-0 flex flex-col">
        {record && (
          <>
            {/* ── Header ── */}
            <SidebarHeader
              navInfo={navInfo}
              records={records}
              onNavigate={onNavigate}
              onDelete={onDelete ? () => onDelete(record.id) : undefined}
              onClose={onClose}
            />

            {/* ── Topic Breadcrumb ── */}
            {topicPath && topicPath.length > 0 && (
              <TopicBreadcrumb path={topicPath} />
            )}

            {/* ── Scrollable Body ── */}
            <div className="flex-1 overflow-auto">
              {/* Scores Section */}
              {jobColumns && jobColumns.length > 0 && scores && (
                <ScoresSection columns={jobColumns} scores={scores} />
              )}

              {/* Tools Section — show available tool definitions */}
              {toolDefinitions.length > 0 && (
                <ToolDefinitionsSection tools={toolDefinitions} />
              )}

              {/* Conversation Section — uses composed system prompt when hierarchy available */}
              {composedMessages.length > 0 && (
                <ConversationSection messages={composedMessages} />
              )}

              {/* Ground Truth Section — the GRPO target. Shown as a distinct
                  section rather than merged into Conversation because for
                  most records the GT is a structured tool call / action
                  (not an assistant message) and users need to compare it
                  directly against the rollout. */}
              {(() => {
                const gt = getRecordGroundTruth(record);
                if (!gt) return null;
                return <GroundTruthSection text={gt} />;
              })()}

              {/* Model output — the rollout_content from the latest eval
                  snapshot. Renders only when hydrated (ensureJobSnapshotLoaded
                  was called by the overview or eval detail). Same data as
                  `DryrunEvaluationResultRow` uses — no parallel fetch. */}
              {(() => {
                if (!jobColumns || !scores) return null;
                const evalCols = jobColumns.filter((c) => c.type === "eval");
                if (evalCols.length === 0) return null;
                const latest = evalCols[evalCols.length - 1];
                const rollout = scores.get(latest.id)?.rolloutContent;
                if (!rollout) return null;
                return (
                  <ModelOutputSection
                    text={rollout}
                    jobLabel={latest.label}
                    score={scores.get(latest.id)?.score}
                  />
                );
              })()}

              {/* Query Origin (trace-informed curriculum) */}
              {typeof record.metadata?.prompt_type === "string" && (
                <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Query origin:</span>
                  <QueryOriginBadge origin={getQueryOrigin(record.metadata.prompt_type)} />
                </div>
              )}

              {/* Source Context Section */}
              {resolvedParts.length > 0 && (
                <div className="px-5 py-4 border-b border-border/50">
                  <SectionLabel title="Source Context" />
                  <div className="mt-3">
                    <SourcePartsCell resolvedParts={resolvedParts} unresolvedCount={partRefs.length} />
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <DetailsGrid
                data={record.data}
                sourceCount={uniqueSourceCount}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Header ───

function SidebarHeader({
  navInfo,
  records,
  onNavigate,
  onDelete,
  onClose,
}: {
  readonly navInfo: { index: number; total: number } | null;
  readonly records?: DatasetRecord[];
  readonly onNavigate?: (recordId: string) => void;
  readonly onDelete?: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-border bg-background/95 backdrop-blur z-20">
      <div className="flex items-center gap-3 min-w-0">
        <SheetHeader className="space-y-0">
          <SheetTitle className="text-sm font-semibold whitespace-nowrap">
            Record #{navInfo ? navInfo.index + 1 : ""}
          </SheetTitle>
          <SheetDescription className="sr-only">View record details</SheetDescription>
        </SheetHeader>
        {navInfo && onNavigate && records && (
          <div className="flex items-center bg-muted/50 rounded-lg border border-border p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md"
              disabled={navInfo.index === 0}
              onClick={() => onNavigate(records[navInfo.index - 1].id)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[10px] text-muted-foreground tabular-nums px-1.5">
              {navInfo.index + 1}/{navInfo.total}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md"
              disabled={navInfo.index === navInfo.total - 1}
              onClick={() => onNavigate(records[navInfo.index + 1].id)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p className="text-xs">Edit record</p></TooltipContent>
          </Tooltip>
          {onDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onDelete}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Delete record</p></TooltipContent>
            </Tooltip>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            <span className="text-sm font-medium">&times;</span>
          </button>
        </div>
      </TooltipProvider>
    </div>
  );
}

// ─── Topic Breadcrumb ───

function TopicBreadcrumb({ path }: { readonly path: string[] }) {
  const parentPath = path.slice(0, -1);
  const leaf = path[path.length - 1];

  return (
    <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-border/50 bg-muted/20">
      {parentPath.map((segment, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{segment}</span>
          <span className="text-[10px] text-muted-foreground/50">&rsaquo;</span>
        </span>
      ))}
      <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
        {leaf}
      </span>
    </div>
  );
}

// ─── Scores Section ───

function ScoresSection({
  columns,
  scores,
}: {
  readonly columns: readonly JobColumn[];
  readonly scores: ReadonlyMap<string, RecordJobScore>;
}) {
  // Reverse so newest job is on top (matches user expectation)
  const evalCols = [...columns.filter((c) => c.type === "eval")].reverse();
  const trainCols = [...columns.filter((c) => c.type === "finetune")].reverse();

  if (evalCols.length === 0 && trainCols.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="px-5 py-4 border-b border-border/50">
        <SectionLabel title="Scores" />
        <div className="mt-3 space-y-4">
          {evalCols.length > 0 && (
            <ScoreGroup
              label="Evaluations"
              dotClass="bg-blue-400"
              columns={evalCols}
              scores={scores}
            />
          )}
          {trainCols.length > 0 && (
            <ScoreGroup
              label="Training"
              dotClass="bg-emerald-400"
              columns={trainCols}
              scores={scores}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ScoreGroup({
  label,
  dotClass,
  columns,
  scores,
}: {
  readonly label: string;
  readonly dotClass: string;
  readonly columns: readonly JobColumn[];
  readonly scores: ReadonlyMap<string, RecordJobScore>;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn("w-[5px] h-[5px] rounded-full", dotClass)} />
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="space-y-1">
        {columns.map((col) => {
          const scoreData = scores.get(col.id);
          return (
            <ScoreBarRow
              key={col.id}
              jobId={col.id}
              type={col.type}
              label={col.label}
              scoreData={scoreData}
            />
          );
        })}
      </div>
    </div>
  );
}

function ScoreBarRow({
  jobId,
  type,
  label,
  scoreData,
}: {
  readonly jobId: string;
  readonly type: "eval" | "finetune";
  readonly label: string;
  readonly scoreData?: RecordJobScore;
}) {
  const score = scoreData?.score;
  const status = scoreData?.status ?? "queued";
  const trend = scoreData?.trend;
  const reason = scoreData?.reason;

  const isRunning = status === "running";
  const isQueued = status === "queued" && score == null;

  const barWidth = score != null ? `${score * 100}%` : isRunning ? "60%" : "0%";

  const barColorClass = score != null
    ? score >= 0.8 ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/30"
    : score >= 0.6 ? "bg-gradient-to-r from-amber-500/15 to-amber-500/30"
    : "bg-gradient-to-r from-red-500/15 to-red-500/30"
    : isRunning ? "bg-gradient-to-r from-violet-500/10 to-violet-500/20 animate-pulse" : "";

  const valColorClass = score != null
    ? score >= 0.8 ? "text-emerald-400" : score >= 0.6 ? "text-amber-400" : "text-red-400"
    : isRunning ? "text-violet-400" : "text-muted-foreground/40";

  return (
    <div className="flex items-center gap-2.5 h-7">
      <button
        type="button"
        className="w-20 text-[11px] text-muted-foreground/60 shrink-0 truncate text-left hover:text-foreground hover:underline transition-colors cursor-pointer"
        title={label}
        onClick={() => {
          window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
            detail: { jobId, type },
          }));
        }}
      >
        {label}
      </button>
      <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
        {barWidth !== "0%" && (
          <div
            className={cn("absolute inset-y-0 left-0 rounded", barColorClass)}
            style={{ width: barWidth }}
          />
        )}
      </div>
      <span className={cn(
        "w-11 text-right shrink-0 tabular-nums font-mono text-xs font-semibold",
        valColorClass,
      )}>
        {score != null ? score.toFixed(2)
          : isRunning ? <span className="inline-block w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
          : isQueued ? <span className="font-sans font-normal text-[11px] italic">queued</span>
          : "—"}
      </span>
      <span className="w-4 text-center text-[11px] shrink-0">
        {trend != null && trend > 0.005 && <span className="text-emerald-400">&uarr;</span>}
        {trend != null && trend < -0.005 && <span className="text-red-400">&darr;</span>}
      </span>
      {reason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="w-4 shrink-0 flex items-center justify-center">
              <Info className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[300px]">
            <p className="text-xs whitespace-pre-wrap">{reason}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="w-4 shrink-0" />
      )}
    </div>
  );
}

// ─── Conversation Section ───

interface ToolCallInfo {
  readonly name: string;
  readonly arguments: string;
}

interface ExtractedMessage {
  readonly role: string;
  readonly content: string;
  readonly toolCalls?: readonly ToolCallInfo[];
  /** For tool-result messages: the name of the tool that produced this result */
  readonly toolName?: string;
}

function extractTextContent(msg: Record<string, unknown>): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((c: { text?: string }) => c.text || "").join("");
  }
  return "";
}

function extractToolCalls(msg: Record<string, unknown>): ToolCallInfo[] {
  if (!Array.isArray(msg.tool_calls)) return [];
  return msg.tool_calls.map((tc: Record<string, unknown>) => {
    const fn = tc.function as Record<string, unknown> | undefined;
    const name = String(fn?.name ?? tc.name ?? "tool_call");
    const rawArgs = fn?.arguments ?? tc.arguments ?? "";
    const argsStr = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
    return { name, arguments: argsStr };
  });
}

/** Strip tool catalogue appended to system messages (e.g., "[Tools available: ...]") */
function stripToolCatalogue(content: string): string {
  const marker = content.lastIndexOf("[Tools available:");
  if (marker === -1) return content;
  return content.slice(0, marker).trimEnd();
}

function extractMessages(data: unknown): ExtractedMessage[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  const result: ExtractedMessage[] = [];

  // OpenAI format: top-level messages array (used by OTel trace records)
  const topLevelMsgs = Array.isArray(d.messages) ? d.messages : null;
  // vLLora format: nested under input.messages
  const inputMsgs = (d.input as Record<string, unknown> | undefined)?.messages;
  const msgs = topLevelMsgs ?? (Array.isArray(inputMsgs) ? inputMsgs : null);

  if (msgs) {
    for (const msg of msgs) {
      const m = msg as Record<string, unknown>;
      let content = extractTextContent(m);
      if ((m.role as string) === "system") {
        content = stripToolCatalogue(content);
      }
      const toolCalls = extractToolCalls(m);
      const toolName = (m.role === "tool") ? String(m.name ?? "") : undefined;
      result.push({
        role: (m.role as string) || "user",
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolName: toolName || undefined,
      });
    }
  }

  return result;
}

function ConversationSection({ messages }: { readonly messages: readonly ExtractedMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="px-5 py-4 border-b border-border/50">
        <SectionLabel title="Conversation" />
        <p className="mt-3 text-xs text-muted-foreground/50 italic">No messages</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 border-b border-border/50">
      <SectionLabel title="Conversation" />
      <div className="mt-3 space-y-2">
        {messages.map((msg, i) => {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            return <ToolCallBubble key={i} content={msg.content} toolCalls={msg.toolCalls} />;
          }
          if (msg.role === "tool") {
            return <ToolResultBubble key={i} toolName={msg.toolName} content={msg.content} />;
          }
          return <MessageBubble key={i} role={msg.role} content={msg.content} />;
        })}
      </div>
    </div>
  );
}

const ROLE_STYLES: Record<string, { labelClass: string; borderClass: string; bgClass: string; textClass: string }> = {
  system: {
    labelClass: "text-muted-foreground/50",
    borderClass: "border-dashed border-border/60",
    bgClass: "bg-muted/10",
    textClass: "text-muted-foreground/70",
  },
  user: {
    labelClass: "text-emerald-400/70",
    borderClass: "border-border/60",
    bgClass: "bg-muted/20",
    textClass: "text-foreground",
  },
  assistant: {
    labelClass: "text-blue-400/70",
    borderClass: "border-blue-500/20",
    bgClass: "bg-blue-500/5",
    textClass: "text-foreground/90",
  },
};

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted/50 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function MessageBubble({ role, content }: { readonly role: string; readonly content: string }) {
  const style = ROLE_STYLES[role.toLowerCase()] ?? ROLE_STYLES.user;

  return (
    <div className={cn("rounded-lg border p-3 group/bubble", style.borderClass, style.bgClass)}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-[9px] font-semibold uppercase tracking-wider", style.labelClass)}>
          {role}
        </span>
        <span className="opacity-0 group-hover/bubble:opacity-100 transition-opacity">
          <CopyButton text={content} />
        </span>
      </div>
      <p className={cn("text-xs leading-relaxed whitespace-pre-wrap", style.textClass)}>
        {content}
      </p>
    </div>
  );
}

function ToolCallBubble({ content, toolCalls }: { readonly content: string; readonly toolCalls: readonly ToolCallInfo[] }) {
  const copyText = toolCalls.map(tc => {
    try { return `${tc.name}(${JSON.stringify(JSON.parse(tc.arguments), null, 2)})`; }
    catch { return `${tc.name}(${tc.arguments})`; }
  }).join("\n");

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 group/bubble">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400/70">
          Assistant → Tool Call
        </span>
        <span className="opacity-0 group-hover/bubble:opacity-100 transition-opacity">
          <CopyButton text={copyText} />
        </span>
      </div>
      {content && (
        <p className="text-xs leading-relaxed text-foreground/90 mb-2">{content}</p>
      )}
      <div className="space-y-1.5">
        {toolCalls.map((tc, i) => (
          <ToolCallCard key={i} name={tc.name} args={tc.arguments} />
        ))}
      </div>
    </div>
  );
}

function ToolCallCard({ name, args }: { readonly name: string; readonly args: string }) {
  // Pretty-print JSON args
  let formattedArgs = args;
  try {
    const parsed = JSON.parse(args);
    formattedArgs = JSON.stringify(parsed, null, 2);
  } catch {
    // keep raw string
  }

  return (
    <div className="rounded-md bg-background/60 border border-border/40 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/30 border-b border-border/30">
        <Wrench className="w-3 h-3 text-amber-400" />
        <span className="text-[11px] font-mono font-semibold text-foreground/90">{name}</span>
      </div>
      <pre className="px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground font-mono overflow-x-auto max-h-32 overflow-y-auto">
        {formattedArgs}
      </pre>
    </div>
  );
}

function ToolResultBubble({ toolName, content }: { readonly toolName?: string; readonly content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 300;
  const displayContent = isLong && !expanded ? content.slice(0, 300) + "…" : content;

  // Try to pretty-print if it looks like JSON
  let formatted = displayContent;
  if (!isLong || expanded) {
    try {
      const parsed = JSON.parse(content);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      // keep raw
    }
  }

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 group/bubble">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-400/70">
            Tool Result
          </span>
          {toolName && (
            <span className="text-[10px] font-mono text-purple-300/60 bg-purple-500/10 px-1.5 py-0.5 rounded">
              {toolName}
            </span>
          )}
        </div>
        <span className="opacity-0 group-hover/bubble:opacity-100 transition-opacity">
          <CopyButton text={content} />
        </span>
      </div>
      <pre className="text-[10px] leading-relaxed text-muted-foreground/80 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
        {formatted}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[10px] text-purple-400/60 hover:text-purple-400 transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// ─── Tool Definitions Section ───

interface ParsedToolDef {
  readonly name: string;
  readonly description: string;
  readonly params: readonly { name: string; type: string; description: string; required: boolean }[];
}

function parseToolDefs(tools: readonly Record<string, unknown>[]): ParsedToolDef[] {
  return tools.map((t) => {
    const fn = (t.function ?? t) as Record<string, unknown>;
    const name = String(fn.name ?? "?");
    const description = String(fn.description ?? "");
    const parameters = (fn.parameters ?? {}) as Record<string, unknown>;
    const properties = (parameters.properties ?? {}) as Record<string, Record<string, unknown>>;
    const requiredSet = new Set(Array.isArray(parameters.required) ? parameters.required as string[] : []);

    const params = Object.entries(properties).map(([pName, pDef]) => ({
      name: pName,
      type: String(pDef.type ?? pDef.enum ? "enum" : "any"),
      description: String(pDef.description ?? ""),
      required: requiredSet.has(pName),
    }));

    return { name, description, params };
  });
}

function ToolDefinitionsSection({ tools }: { readonly tools: readonly Record<string, unknown>[] }) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const parsed = useMemo(() => parseToolDefs(tools), [tools]);
  const copyText = useMemo(() => JSON.stringify(tools, null, 2), [tools]);

  const toggle = (name: string) =>
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const expandAll = () => setExpandedTools(new Set(parsed.map(t => t.name)));
  const collapseAll = () => setExpandedTools(new Set());
  const allExpanded = expandedTools.size === parsed.length;

  return (
    <div className="px-5 py-4 border-b border-border/50">
      <div className="flex items-center justify-between">
        <SectionLabel title={`Tools (${tools.length})`} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
          <CopyButton text={copyText} />
        </div>
      </div>
      <div className="mt-2 space-y-px rounded-md border border-border/40 overflow-hidden">
        {parsed.map((tool, idx) => {
          const isOpen = expandedTools.has(tool.name);
          return (
            <div key={`${tool.name}-${idx}`} className={idx > 0 ? "border-t border-border/20" : ""}>
              <button
                type="button"
                onClick={() => toggle(tool.name)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors"
              >
                <Wrench className="w-3 h-3 text-amber-400/70 shrink-0" />
                <span className="text-[11px] font-mono font-medium text-foreground/80">{tool.name}</span>
                <span className="text-[9px] text-muted-foreground/30 ml-auto tabular-nums shrink-0">
                  {tool.params.length}p
                </span>
              </button>
              {isOpen && (
                <div className="px-2.5 pb-2 bg-muted/10">
                  {tool.description && (
                    <p className="text-[10px] text-muted-foreground/50 mb-1.5 leading-relaxed italic">
                      {tool.description}
                    </p>
                  )}
                  {tool.params.length > 0 && (
                    <table className="w-full text-[10px]">
                      <tbody>
                        {tool.params.map((p) => (
                          <tr key={p.name} className="border-t border-border/10">
                            <td className="py-0.5 pr-2 font-mono text-foreground/70 whitespace-nowrap align-top">
                              {p.name}
                              {p.required && <span className="text-red-400/50 ml-0.5">*</span>}
                            </td>
                            <td className="py-0.5 pr-2 text-muted-foreground/30 whitespace-nowrap align-top">{p.type}</td>
                            <td className="py-0.5 text-muted-foreground/40 align-top">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Details Grid ───

function DetailsGrid({
  data,
  sourceCount,
}: {
  readonly data: unknown;
  readonly sourceCount: number;
}) {
  const tokens = estimateTokens(data);
  const turns = countTurns(data);

  return (
    <div className="px-5 py-4">
      <SectionLabel title="Details" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <DetailCard icon={<Wrench className="w-3 h-3 text-muted-foreground" />} value={tokens.toLocaleString()} label="Tokens" />
        <DetailCard
          icon={<FileText className="w-3 h-3 text-muted-foreground" />}
          value={sourceCount > 0 ? `${sourceCount}` : "—"}
          label="Sources"
        />
        <DetailCard icon={<MessageSquare className="w-3 h-3 text-muted-foreground" />} value={String(turns)} label="Turns" />
      </div>
    </div>
  );
}

function DetailCard({
  icon,
  value,
  label,
}: {
  readonly icon: React.ReactNode;
  readonly value: string;
  readonly label: string;
}) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Ground Truth Section ───

/**
 * Renders the record's `ground_truth` field as a distinct panel.
 *
 * Why separate from Conversation: for GRPO records the GT is a structured
 * target (often a tool-call formatted as `Action: name. arg: value`) rather
 * than a natural assistant message, so it deserves visual separation and its
 * own copy button. For pure conversational datasets where GT *is* the
 * expected assistant turn, this still reads correctly — just labelled more
 * explicitly than the conversation's assistant bubble.
 */
function GroundTruthSection({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="px-5 py-4 border-b border-border/50">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionLabel title="Ground truth" />
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-5 items-center gap-1 rounded border border-border/60 bg-card/40 px-1.5 text-[10px] text-muted-foreground/80 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          title={copied ? "Copied" : "Copy ground truth"}
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
      </div>
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-emerald-300/90 whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}

// ─── Model Output Section ───

/**
 * Renders `rollout_content` from the latest eval — what the model actually
 * produced for this record. Sits below Ground Truth so users can visually
 * diff "expected vs got". Tone is amber when the paired score is < 0.6 to
 * flag divergence at a glance.
 */
function ModelOutputSection({
  text,
  jobLabel,
  score,
}: {
  readonly text: string;
  readonly jobLabel: string;
  readonly score?: number;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const tone =
    typeof score === "number" && score < 0.6
      ? { border: "border-rose-500/30", bg: "bg-rose-500/[0.04]", text: "text-rose-200/90" }
      : typeof score === "number" && score < 0.8
        ? { border: "border-amber-500/30", bg: "bg-amber-500/[0.04]", text: "text-amber-200/90" }
        : { border: "border-border/60", bg: "bg-zinc-900/30", text: "text-foreground/90" };
  return (
    <div className="px-5 py-4 border-b border-border/50">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <SectionLabel title="Model output" />
          <span className="font-mono text-[10px] text-muted-foreground/60">{jobLabel}</span>
          {typeof score === "number" && (
            <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
              · score {score.toFixed(2)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-5 items-center gap-1 rounded border border-border/60 bg-card/40 px-1.5 text-[10px] text-muted-foreground/80 transition-colors hover:text-foreground"
          title={copied ? "Copied" : "Copy model output"}
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
      </div>
      <div
        className={cn(
          "rounded-md border px-3 py-2 font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap break-words",
          tone.border,
          tone.bg,
          tone.text,
        )}
      >
        {text}
      </div>
    </div>
  );
}

// ─── Shared ───

function SectionLabel({ title }: { readonly title: string }) {
  return (
    <h3 className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em]">
      {title}
    </h3>
  );
}
