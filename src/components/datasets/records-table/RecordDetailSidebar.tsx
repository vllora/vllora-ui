/**
 * RecordDetailSidebar
 *
 * Redesigned sheet/drawer for viewing record details.
 * Layout: Header → Topic breadcrumb → Scores (eval/train split) →
 *         Conversation (system + user) → Source Context → Details grid.
 */

import { useMemo } from "react";
import { Trash2, ChevronLeft, ChevronRight, Pencil, FileText, Coins, MessageSquare } from "lucide-react";
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
import { DatasetRecord, DataInfo } from "@/types/dataset-types";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import type { AvailableTopic } from "../record-utils";
import type { JobColumn, RecordJobScore } from "./job-score-columns";
import { estimateTokens, countTurns } from "./cells/StatsBadge";
import { SourcePartsCell, useResolvedSourceParts } from "./shared-record-cells";

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

  // Resolve source_parts refs (same logic as table rows)
  const { sources } = KnowledgeSourcesConsumer();
  const { partRefs, resolvedParts } = useResolvedSourceParts(
    record ?? ({ metadata: {} } as DatasetRecord),
    sources,
  );
  const sourceCount = partRefs.length;

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

              {/* Conversation Section */}
              {messages.length > 0 && (
                <ConversationSection messages={messages} />
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
                sourceCount={sourceCount}
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
  const evalCols = columns.filter((c) => c.type === "eval");
  const trainCols = columns.filter((c) => c.type === "finetune");

  if (evalCols.length === 0 && trainCols.length === 0) return null;

  return (
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
  label,
  scoreData,
}: {
  readonly label: string;
  readonly scoreData?: RecordJobScore;
}) {
  const score = scoreData?.score;
  const status = scoreData?.status ?? "queued";
  const trend = scoreData?.trend;

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
      <span className="w-6 text-[11px] text-muted-foreground/60 shrink-0">{label}</span>
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
    </div>
  );
}

// ─── Conversation Section ───

interface ExtractedMessage {
  readonly role: string;
  readonly content: string;
}

function extractMessageContent(msg: { role?: string; content?: unknown }): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((c: { text?: string }) => c.text || "").join("");
  }
  return "";
}

function extractMessages(data: unknown): ExtractedMessage[] {
  const dataInfo = data as DataInfo | undefined;
  if (!dataInfo) return [];

  const result: ExtractedMessage[] = [];

  // Input messages (system + user)
  if (dataInfo.input?.messages && Array.isArray(dataInfo.input.messages)) {
    for (const msg of dataInfo.input.messages) {
      result.push({ role: msg.role || "user", content: extractMessageContent(msg) });
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
      <div className="mt-3 space-y-3">
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
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

function MessageBubble({ role, content }: { readonly role: string; readonly content: string }) {
  const style = ROLE_STYLES[role.toLowerCase()] ?? ROLE_STYLES.user;

  return (
    <div className={cn("rounded-lg border p-3", style.borderClass, style.bgClass)}>
      <span className={cn("text-[9px] font-semibold uppercase tracking-wider block mb-1.5", style.labelClass)}>
        {role}
      </span>
      <p className={cn("text-xs leading-relaxed whitespace-pre-wrap", style.textClass)}>
        {content}
      </p>
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
        <DetailCard icon={<Coins className="w-3 h-3 text-muted-foreground" />} value={tokens.toLocaleString()} label="Tokens" />
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

// ─── Shared ───

function SectionLabel({ title }: { readonly title: string }) {
  return (
    <h3 className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em]">
      {title}
    </h3>
  );
}
