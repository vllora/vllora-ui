/**
 * TopicInspectorDrawer
 *
 * Bottom sheet with 2 snap points (like Apple/Google Maps):
 * - Peek (~48px): Header bar with topic name, record count, avg score, source count.
 *   Click or drag up to expand.
 * - Expanded (~40vh): Tabbed Records (table) / Sources (cards).
 *   Click header or drag down to collapse back to peek.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { X, ChevronUp, ChevronDown, FileText, ExternalLink, Sparkles, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { findTopicInHierarchy } from "../record-utils";
import { formatTopicName } from "./TopicNodeHeader";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import { extractMessages, cleanText } from "../records-table/cells/ConversationThreadCell.utilities";
import { FallbackScorePill, SourcePartsCell, useResolvedSourceParts } from "../records-table/shared-record-cells";
import { emitter } from "@/utils/eventEmitter";
import type { TopicHierarchyNode, DatasetRecord } from "@/types/dataset-types";
import type { KnowledgeSource, KnowledgeSourcePart } from "@/types/knowledge-types";

type DrawerSnap = "peek" | "expanded";
type ExpandedTab = "records" | "sources";

const PEEK_HEIGHT = 48;
const EXPANDED_HEIGHT = "40vh";

export function TopicInspectorDrawer() {
  const {
    viewingTopicId,
    closeTopicModal,
    recordsByTopic,
    hierarchy,
    workflowId,
    topicQualityScores,
  } = TopicCanvasConsumer();

  const { sources } = KnowledgeSourcesConsumer();

  const [snap, setSnap] = useState<DrawerSnap>("peek");
  const [activeTab, setActiveTab] = useState<ExpandedTab>("records");

  // Reset to peek when topic changes
  useEffect(() => {
    setSnap("peek");
    setActiveTab("records");
  }, [viewingTopicId]);

  // Resolve topic info
  const { topicNode, topicRecords, displayName, sourceRefs } = useMemo(() => {
    if (!viewingTopicId) {
      return { topicNode: undefined, topicRecords: [], displayName: "", sourceRefs: [] as string[] };
    }
    const node = hierarchy ? findTopicInHierarchy(hierarchy, viewingTopicId) : undefined;
    const records = collectAllRecords(viewingTopicId, recordsByTopic, hierarchy);
    const refs = (node?.sourceChunkRefs ?? []) as string[];
    return {
      topicNode: node,
      topicRecords: records,
      displayName: formatTopicName(node?.name ?? viewingTopicId),
      sourceRefs: refs,
    };
  }, [viewingTopicId, hierarchy, recordsByTopic]);

  // Resolve source references
  const resolvedSources = useMemo(
    () => resolveAndGroupBySource(sourceRefs, sources),
    [sourceRefs, sources],
  );

  // Quality score — try both ID and name
  const quality = viewingTopicId
    ? (topicQualityScores?.[viewingTopicId] ?? (topicNode?.name ? topicQualityScores?.[topicNode.name] : undefined))
    : undefined;

  const toggleSnap = useCallback(() => {
    setSnap(prev => prev === "peek" ? "expanded" : "peek");
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (snap === "expanded") {
          setSnap("peek");
        } else {
          closeTopicModal();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTopicModal, snap]);

  const navigateToPart = useCallback((sourceId: string, partId: string) => {
    if (!workflowId) return;
    emitter.emit('vllora_switch_tab', { workflowId, tab: `knowledge/${sourceId}/${partId}` });
  }, [workflowId]);

  if (!viewingTopicId) return null;

  const isExpanded = snap === "expanded";

  return (
    <div
      className={cn(
        "border-t border-border bg-background shrink-0 flex flex-col overflow-hidden",
        "transition-[height] duration-300 ease-out",
      )}
      style={{ height: isExpanded ? EXPANDED_HEIGHT : PEEK_HEIGHT }}
    >
      {/* ── Peek header bar — always visible, clickable to toggle ── */}
      <button
        type="button"
        onClick={toggleSnap}
        className={cn(
          "flex items-center gap-3 px-4 shrink-0 w-full text-left transition-colors",
          "hover:bg-muted/30 group",
          isExpanded ? "py-2 border-b border-border/50" : "py-0 h-full",
        )}
      >
        <span className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
          {isExpanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronUp className="w-4 h-4" />
          }
        </span>

        <h3 className="text-sm font-semibold text-foreground truncate">{displayName}</h3>

        <div className="flex items-center gap-2 shrink-0">
          <StatPill value={topicRecords.length} label={topicRecords.length === 1 ? "record" : "records"} />
          <StatPill value={sourceRefs.length} label={sourceRefs.length === 1 ? "source" : "sources"} icon={<FileText className="w-2.5 h-2.5" />} />
          {quality && quality.evaluated > 0 && (
            <span className={cn(
              "text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded",
              quality.avg >= 0.8 ? "bg-emerald-500/10 text-emerald-400"
                : quality.avg >= 0.6 ? "bg-amber-500/10 text-amber-400"
                : "bg-red-500/10 text-red-400"
            )}>
              {quality.avg.toFixed(2)} avg
            </span>
          )}
        </div>

        <div className="flex-1" />

        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); closeTopicModal(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); closeTopicModal(); } }}
          className="p-1 rounded hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      </button>

      {/* ── Expanded content ── */}
      {isExpanded && (
        <ExpandedContent
          topicRecords={topicRecords}
          resolvedSources={resolvedSources}
          sourceRefs={sourceRefs}
          sources={sources}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onNavigateToPart={navigateToPart}
        />
      )}
    </div>
  );
}

// ─── Stat pill ───

function StatPill({ value, label, icon }: {
  readonly value: number;
  readonly label: string;
  readonly icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
      {icon}
      <span className="font-medium text-foreground/60 tabular-nums">{value}</span>
      {label}
    </span>
  );
}

// ─── Expanded content with tabs ───

function ExpandedContent({
  topicRecords,
  resolvedSources,
  sourceRefs,
  sources,
  activeTab,
  onTabChange,
  onNavigateToPart,
}: {
  readonly topicRecords: readonly DatasetRecord[];
  readonly resolvedSources: Map<string, { source: KnowledgeSource; parts: KnowledgeSourcePart[] }>;
  readonly sourceRefs: readonly string[];
  readonly sources: readonly KnowledgeSource[];
  readonly activeTab: ExpandedTab;
  readonly onTabChange: (tab: ExpandedTab) => void;
  readonly onNavigateToPart: (sourceId: string, partId: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-border/50 shrink-0">
        <TabButton
          active={activeTab === "records"}
          icon={<LayoutList className="w-3.5 h-3.5" />}
          label={`Records (${topicRecords.length})`}
          onClick={() => onTabChange("records")}
        />
        <TabButton
          active={activeTab === "sources"}
          icon={<FileText className="w-3.5 h-3.5" />}
          label={`Sources (${sourceRefs.length})`}
          onClick={() => onTabChange("sources")}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "records" ? (
          <RecordsTable records={topicRecords} sources={sources} />
        ) : (
          <SourcesPanel resolvedSources={resolvedSources} onNavigateToPart={onNavigateToPart} />
        )}
      </div>
    </div>
  );
}

// ─── Records table ───

function RecordsTable({
  records,
  sources,
}: {
  readonly records: readonly DatasetRecord[];
  readonly sources: readonly KnowledgeSource[];
}) {
  if (records.length === 0) {
    return <EmptyState text="No records yet" />;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 bg-background z-10">
        <tr className="border-b border-border/50">
          <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 py-2 w-10">#</th>
          <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 py-2">Input</th>
          <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 py-2 w-[80px]">Score</th>
          <th className="text-left text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 py-2 w-[150px]">Source</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record, idx) => (
          <RecordRow key={record.id} record={record} index={idx + 1} sources={sources} />
        ))}
      </tbody>
    </table>
  );
}

function RecordRow({
  record,
  index,
  sources,
}: {
  readonly record: DatasetRecord;
  readonly index: number;
  readonly sources: readonly KnowledgeSource[];
}) {
  const messages = extractMessages(record.data);
  const userMsg = messages.find(m => m.role === "user");
  const userText = userMsg ? cleanText(userMsg.content) : "";
  const score = record.evaluation?.score ?? record.evaluation?.evalScore;
  const { resolvedParts } = useResolvedSourceParts(record, sources);
  const unresolvedCount = 0;

  return (
    <tr className="border-b border-border/20 hover:bg-muted/20 transition-colors group">
      {/* Row number */}
      <td className="px-3 py-2 text-muted-foreground/30 tabular-nums align-top">{index}</td>

      {/* Input text */}
      <td className="px-3 py-2 align-top">
        <div className="flex items-start gap-1.5">
          {record.is_generated && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))] shrink-0 mt-0.5">
              <Sparkles className="w-2 h-2" />
              AI
            </span>
          )}
          <span className="text-foreground/80 line-clamp-2 leading-relaxed">{userText || "—"}</span>
        </div>
      </td>

      {/* Score */}
      <td className="px-3 py-2 align-top">
        <FallbackScorePill score={score} />
      </td>

      {/* Source */}
      <td className="px-3 py-2 align-top">
        <SourcePartsCell resolvedParts={resolvedParts} unresolvedCount={unresolvedCount} />
      </td>
    </tr>
  );
}

// ─── Sources panel ───

function SourcesPanel({
  resolvedSources,
  onNavigateToPart,
}: {
  readonly resolvedSources: Map<string, { source: KnowledgeSource; parts: KnowledgeSourcePart[] }>;
  readonly onNavigateToPart: (sourceId: string, partId: string) => void;
}) {
  if (resolvedSources.size === 0) {
    return <EmptyState text="No sources linked" />;
  }

  return (
    <div className="p-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
      {[...resolvedSources.values()].map(({ source, parts }) => (
        <SourceCard key={source.id} source={source} parts={parts} onNavigate={onNavigateToPart} />
      ))}
    </div>
  );
}

// ─── Source Card ───

function SourceCard({
  source,
  parts,
  onNavigate,
}: {
  readonly source: KnowledgeSource;
  readonly parts: readonly KnowledgeSourcePart[];
  readonly onNavigate: (sourceId: string, partId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <FileText className="w-3 h-3 shrink-0 text-blue-400" />
        <span className="text-[11px] font-medium text-foreground/80 truncate">{source.name}</span>
        <span className="text-[9px] text-muted-foreground/40 shrink-0 tabular-nums">
          {parts.length} part{parts.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="ml-5 space-y-0.5">
        {parts.map(part => (
          <button
            key={part.id}
            type="button"
            onClick={() => onNavigate(source.id, part.id)}
            className="w-full flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted/50 transition-colors group"
          >
            <PartDot type={part.type} />
            <span className="text-[10px] truncate flex-1 text-foreground/60">
              {part.title ?? "Untitled"}
            </span>
            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 shrink-0 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

function PartDot({ type }: { readonly type: KnowledgeSourcePart["type"] }) {
  const color = type === "table" ? "bg-amber-400" : type === "image" ? "bg-purple-400" : "bg-blue-400";
  return <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", color)} />;
}

// ─── Shared ───

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-[rgb(var(--theme-500))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ text }: { readonly text: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground/30 text-xs py-8">
      {text}
    </div>
  );
}

/** Collect all records for a topic, including descendant topics */
function collectAllRecords(
  topicId: string,
  recordsByTopic: Record<string, DatasetRecord[]>,
  hierarchy?: TopicHierarchyNode[],
): DatasetRecord[] {
  const records: DatasetRecord[] = [];
  const node = hierarchy ? findTopicInHierarchy(hierarchy, topicId) : undefined;

  const directRecords = recordsByTopic[topicId]
    ?? (node?.name && node.name !== topicId ? recordsByTopic[node.name] : undefined);
  if (directRecords) records.push(...directRecords);

  if (node?.children) {
    const collectChildren = (children: TopicHierarchyNode[]) => {
      for (const child of children) {
        const childKey = child.id || child.name;
        const childRecords = recordsByTopic[childKey] ?? recordsByTopic[child.name];
        if (childRecords) records.push(...childRecords);
        if (child.children) collectChildren(child.children);
      }
    };
    collectChildren(node.children);
  }

  return records;
}
