/**
 * ConversationDataTable
 *
 * Unified table for displaying conversation data in two modes:
 * - "jsonl-read-only": For skill-package JSONL preview (no actions, simple score badge)
 * - "synthetic-data-manage": For DATA records (checkboxes, actions menu, quality indicator)
 *
 * Consistent styling across both modes: same font sizes, expand/collapse behavior,
 * column layout (# | user | assistant | score | tokens).
 */

import { useState, useCallback, useMemo, Fragment } from "react";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { DatasetRecord, KnowledgeSource } from "@/types/dataset-types";
import type { AvailableTopic } from "../record-utils";
import { SelectionCheckbox, QualityIndicator, RecordActions } from "../records-table/cells";
import { RecordDataDialog } from "../records-table/RecordDataDialog";
import { emitter } from "@/utils/eventEmitter";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { getRecordSourceAttributions } from "@/lib/distri-finetune-tools/steps/shared/source-attribution";
import { ConversationExpandedDetail } from "./ConversationExpandedDetail";
import type { ConversationRow, ConversationTableMode } from "./types";

// ─── System prompt banner (read-only mode) ───

function SystemBanner({ systemPrompt }: { readonly systemPrompt: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!systemPrompt.trim()) return null;

  return (
    <button
      type="button"
      className="w-full text-left rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-3"
      onClick={() => setIsExpanded((prev) => !prev)}
    >
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-amber-400 shrink-0" />
        )}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20">
          System
        </span>
        {!isExpanded && (
          <span className="text-xs text-amber-400/50 truncate">
            {systemPrompt}
          </span>
        )}
      </div>
      {isExpanded && (
        <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed mt-2 ml-5">
          {systemPrompt}
        </p>
      )}
    </button>
  );
}

// ─── Source ref badge (compact cell display) ───

function SourceRefBadge({
  sourceChunkRefs,
  sources,
  onNavigateToSource,
}: {
  readonly sourceChunkRefs: string[] | undefined;
  readonly sources: KnowledgeSource[];
  readonly onNavigateToSource?: (sourceId: string) => void;
}) {
  const attributions = useMemo(
    () => getRecordSourceAttributions(sourceChunkRefs, sources),
    [sourceChunkRefs, sources],
  );

  if (attributions.length === 0) {
    return <span className="text-[10px] text-muted-foreground/30">—</span>;
  }

  const primary = attributions[0];
  const displayName = primary.sourceName.replace(/\.[^.]+$/, "");
  const totalChunks = sourceChunkRefs?.length ?? 0;

  const handleClick = onNavigateToSource
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onNavigateToSource(primary.sourceId);
      }
    : undefined;

  return (
    <button
      type="button"
      disabled={!onNavigateToSource}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 max-w-[140px]",
        onNavigateToSource && "hover:bg-blue-500/20 cursor-pointer transition-colors",
      )}
    >
      <FileText className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{displayName}</span>
      {attributions.length > 1 && (
        <span className="text-blue-400/60 shrink-0">+{attributions.length - 1}</span>
      )}
      {totalChunks > 0 && (
        <span className="text-blue-400/50 shrink-0">({totalChunks})</span>
      )}
    </button>
  );
}

// ─── Props ───

interface ConversationDataTableProps {
  readonly rows: readonly ConversationRow[];
  readonly mode: ConversationTableMode;
  /** System prompt shown as banner above table (read-only mode) */
  readonly systemPrompt?: string;
  // ─── Manage-mode props (all optional) ───
  readonly selectable?: boolean;
  readonly selectedIds?: ReadonlySet<string>;
  readonly onSelectRecord?: (id: string, checked: boolean) => void;
  readonly onDelete?: (id: string) => void;
  readonly onSave?: (id: string, data: unknown) => Promise<void>;
  readonly onUpdateTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  readonly onUpdateEvaluation?: (recordId: string, score: number | undefined) => Promise<void>;
  readonly availableTopics?: AvailableTopic[];
  /** ID of row to highlight (variant source navigation) */
  readonly highlightedRowId?: string | null;
  /** Ref setter for scroll-into-view support */
  readonly setRowRef?: (id: string) => (el: HTMLDivElement | null) => void;
  /** Dataset ID for navigation events */
  readonly datasetId?: string;
}

// ─── Main component ───

export function ConversationDataTable({
  rows,
  mode,
  systemPrompt,
  selectable = false,
  selectedIds,
  onSelectRecord,
  onDelete,
  onSave,
  onUpdateTopic,
  onUpdateEvaluation,
  availableTopics,
  highlightedRowId,
  setRowRef,
  datasetId,
}: ConversationDataTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<DatasetRecord | null>(null);
  const { sources } = KnowledgeSourcesConsumer();

  const isManage = mode === "synthetic-data-manage";

  const toggleRow = useCallback((id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }, []);

  // Column count for colSpan on expanded detail
  const colCount = useMemo(() => {
    let count = 5; // #, user, assistant, score, refs/tokens
    if (isManage && selectable) count += 1; // checkbox
    if (isManage) count += 1; // actions
    return count;
  }, [isManage, selectable]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
        No examples found.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* System prompt banner — read-only mode only */}
      {mode === "jsonl-read-only" && systemPrompt && (
        <SystemBanner systemPrompt={systemPrompt} />
      )}

      {/* Summary bar */}
      <div className="text-[11px] text-muted-foreground mb-2">
        {rows.length} row{rows.length !== 1 ? "s" : ""}
        {mode === "jsonl-read-only" && " · 4 columns"}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {/* Checkbox header */}
            {isManage && selectable && (
              <TableHead className="w-8" />
            )}
            {/* Row number */}
            <TableHead className="w-14 text-[11px] font-medium">#</TableHead>
            {/* User */}
            <TableHead className="text-[11px] font-medium">
              <span className="text-blue-400">user</span>
            </TableHead>
            {/* Assistant */}
            <TableHead className="text-[11px] font-medium">
              <span className="text-emerald-400">assistant</span>
            </TableHead>
            {/* Score (manage mode only — JSONL read-only has no meaningful score) */}
            {isManage && (
              <TableHead className="w-20 text-[11px] font-medium text-center">
                score
              </TableHead>
            )}
            {/* Source refs (manage) / tokens (read-only) */}
            <TableHead className={cn(
              "text-[11px] font-medium",
              isManage ? "w-36" : "w-20 text-right",
            )}>
              {isManage ? "source" : "tokens"}
            </TableHead>
            {/* Actions header (manage mode) */}
            {isManage && (
              <TableHead className="w-8" />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedRowId === row.id;
            const isHighlighted = highlightedRowId === row.id;
            const record = row.record;

            return (
              <Fragment key={row.id}>
                <TableRow
                  ref={setRowRef ? (el: HTMLTableRowElement | null) => {
                    // Bridge table row ref to div ref setter
                    if (setRowRef && el) {
                      setRowRef(row.id)(el as unknown as HTMLDivElement);
                    }
                  } : undefined}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isExpanded && "bg-muted/20 hover:bg-muted/20 border-b-0",
                    isHighlighted && "animate-record-highlight",
                    isManage && selectedIds?.has(row.id) && "bg-[rgba(var(--theme-500),0.08)]",
                  )}
                  onClick={() => toggleRow(row.id)}
                >
                  {/* Checkbox (manage mode) */}
                  {isManage && selectable && (
                    <TableCell className="w-8 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <SelectionCheckbox
                        checked={selectedIds?.has(row.id) ?? false}
                        onChange={(checked) => onSelectRecord?.(row.id, checked)}
                      />
                    </TableCell>
                  )}

                  {/* Row number + chevron */}
                  <TableCell className="w-14 text-[11px] text-muted-foreground font-mono align-top py-2.5">
                    <div className="flex items-center gap-1">
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 shrink-0" />
                      )}
                      {row.index}
                    </div>
                  </TableCell>

                  {/* User message */}
                  <TableCell className="align-top py-2.5">
                    <p className="text-[11px] text-foreground line-clamp-2 leading-relaxed">
                      {row.user}
                    </p>
                  </TableCell>

                  {/* Assistant message */}
                  <TableCell className="align-top py-2.5">
                    <p className="text-[11px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
                      {row.assistant}
                    </p>
                  </TableCell>

                  {/* Score (manage mode only) */}
                  {isManage && record && (
                    <TableCell className="w-20 align-top py-2.5">
                      <div className="flex justify-center">
                        <QualityIndicator
                          evaluation={row.evaluation}
                          compact
                          onNavigate={datasetId ? (target) => {
                            emitter.emit("vllora_switch_tab", { datasetId, tab: target });
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent("vllora_highlight_eval_result", {
                                detail: { recordId: row.id },
                              }));
                            }, 300);
                          } : undefined}
                        />
                      </div>
                    </TableCell>
                  )}

                  {/* Source refs (manage) / tokens (read-only) */}
                  <TableCell className={cn(
                    "align-top py-2.5",
                    isManage ? "w-36" : "w-20 text-right",
                  )}>
                    {isManage && record ? (
                      <SourceRefBadge
                        sourceChunkRefs={record.metadata?.sourceChunkRefs as string[] | undefined}
                        sources={sources}
                        onNavigateToSource={datasetId ? (sourceId) => {
                          emitter.emit("vllora_switch_tab", { datasetId, tab: `documents/${sourceId}` });
                        } : undefined}
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
                        {row.tokenEstimate.toLocaleString()} tok
                      </span>
                    )}
                  </TableCell>

                  {/* Actions (manage mode) */}
                  {isManage && (
                    <TableCell className="w-8 align-top py-2.5" onClick={(e) => e.stopPropagation()}>
                      {record && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <RecordActions
                            onEdit={onSave ? () => setEditRecord(record) : undefined}
                            onDelete={() => onDelete?.(row.id)}
                            onGenerateVariants={() => {
                              const userPreview = row.user.length > 100
                                ? row.user.substring(0, 100) + "..."
                                : row.user;
                              const topicInfo = record.topic
                                ? ` This record is in topic "${record.topic}".`
                                : "";
                              emitter.emit("vllora_lucy_prompt", {
                                prompt: `I want to generate variants from record ${record.id}.${topicInfo} The record contains: "${userPreview}". Please ask me how many variants I want to generate and if I have any specific guidance for the variations.`,
                              });
                            }}
                            onCopyId={() => navigator.clipboard.writeText(row.id)}
                          />
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>

                {/* Expanded detail */}
                {isExpanded && (
                  <ConversationExpandedDetail
                    row={row}
                    mode={mode}
                    commonSystem={systemPrompt}
                    colSpan={colCount}
                  />
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* Edit dialog (manage mode — single instance for the whole table) */}
      {isManage && onSave && onUpdateTopic && (
        <RecordDataDialog
          record={editRecord}
          onOpenChange={(open) => { if (!open) setEditRecord(null); }}
          onSave={onSave}
          onUpdateTopic={onUpdateTopic}
          onUpdateEvaluation={onUpdateEvaluation}
          availableTopics={availableTopics}
        />
      )}
    </div>
  );
}
