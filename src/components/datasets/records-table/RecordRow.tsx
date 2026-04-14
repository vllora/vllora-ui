/**
 * RecordRow
 *
 * Displays a single record row with two rendering modes:
 * - Default: conversational thread with badges, full stats, quality text, topic selector
 * - Compact (in topic tree): content-first card — no role badges, minimal stats, score dot
 *
 * Clicking opens the record detail sidebar via onExpand.
 */

import { useState, forwardRef, useCallback, useMemo } from "react";
import { Sparkles, FileText } from "lucide-react";
import { QueryOriginBadge, getQueryOrigin } from "./cells/QueryOriginBadge";
import { DatasetRecord } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { getRecordSourceAttributions } from "@/lib/distri-finetune-tools/steps/shared/source-attribution";
import { ConversationThreadCell, extractMessages, TopicCell, RecordActions, SelectionCheckbox, QualityIndicator, StatsBadge } from "./cells";
import { cleanText } from "./cells/ConversationThreadCell.utilities";
import { RecordDataDialog } from "./RecordDataDialog";
import { COLUMN_WIDTHS } from "../table-columns";
import type { AvailableTopic } from "../record-utils";

interface RecordRowProps {
  record: DatasetRecord;
  /** Row index (1-based) for display */
  index?: number;
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDelete: (recordId: string) => void;
  /** Handler for saving record data changes */
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  /** Handler for updating evaluation score */
  onUpdateEvaluation?: (recordId: string, score: number | undefined) => Promise<void>;
  /** Enable selection checkbox */
  selectable?: boolean;
  /** Whether this row is selected */
  selected?: boolean;
  /** Selection change handler */
  onSelect?: (checked: boolean) => void;
  /** Callback when expand is clicked (legacy - for dialog mode) */
  onExpand?: (record: DatasetRecord) => void;
  /** Whether this record is currently being viewed in the sidebar */
  isViewing?: boolean;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
  /** Hide topic column (used in grouped mode where topic is already shown in tree) */
  hideTopic?: boolean;
  /** Controlled expansion state (for virtualized lists) */
  isExpanded?: boolean;
  /** Controlled expansion toggle (for virtualized lists) */
  onToggleExpand?: () => void;
  /** Whether this record is temporarily highlighted (e.g., when navigating to source) */
  isHighlighted?: boolean;
}

export const RecordRow = forwardRef<HTMLDivElement, RecordRowProps>(function RecordRow({
  record,
  onUpdateTopic,
  onDelete,
  onSave,
  onUpdateEvaluation,
  selectable = false,
  selected = false,
  onSelect,
  onExpand,
  availableTopics = [],
  hideTopic = false,
  isExpanded: _controlledExpanded,
  onToggleExpand: _onToggleExpand,
  isHighlighted = false,
}, ref) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { sources } = KnowledgeSourcesConsumer();

  // Compact mode: content-first display in grouped/topic tree views
  const compact = hideTopic;

  // Resolve source document attributions from record metadata
  const sourceAttributions = useMemo(
    () => getRecordSourceAttributions(
      record.metadata?.sourceChunkRefs as string[] | undefined,
      sources,
    ),
    [record.metadata, sources],
  );

  // Extract user/assistant text for compact column layout
  const { userText, assistantText } = useMemo(() => {
    if (!compact) return { userText: "", assistantText: "" };

    const msgs = extractMessages(record.data).filter(
      (m) => m.role.toLowerCase() !== "system",
    );
    const userMsg = msgs.find((m) => {
      const r = m.role.toLowerCase();
      return r === "user" || r === "human";
    });
    const assistantMsg = msgs.find((m) => {
      const r = m.role.toLowerCase();
      return r === "assistant" || r === "ai" || r === "model";
    });

    const fallback =
      typeof record.metadata?.skillResponse === "string"
        ? record.metadata.skillResponse
        : undefined;

    return {
      userText: userMsg ? cleanText(userMsg.content) : (msgs[0] ? cleanText(msgs[0].content) : ""),
      assistantText: assistantMsg
        ? cleanText(assistantMsg.content)
        : (fallback ? cleanText(fallback) : ""),
    };
  }, [compact, record.data, record.metadata]);

  const handleClick = onExpand ? () => onExpand(record) : undefined;

  // Handler for QualityIndicator click — navigate to evaluator or jobs tab and highlight record
  const handleScoreNavigate = useCallback((target: "evaluator" | "jobs") => {
    emitter.emit("vllora_switch_tab", { workflowId: record.workflowId, tab: target });
    // After tab switch, highlight the record in the results table
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vllora_highlight_eval_result', {
        detail: { recordId: record.id }
      }));
    }, 300);
  }, [record.workflowId, record.id]);

  // Handler to trigger Lucy for variant generation
  const handleGenerateVariants = useCallback(() => {
    // Extract a brief summary from the record for context
    const d = record.data as Record<string, unknown> | null;
    const messages = (Array.isArray(d?.messages) ? d.messages : (d?.input as Record<string, unknown> | undefined)?.messages ?? []) as Array<{ role: string; content: string }>;
    const userMessage = messages.find(m => m.role === "user")?.content || "";
    const preview = userMessage.length > 100 ? userMessage.substring(0, 100) + "..." : userMessage;

    const topicInfo = record.topic ? ` This record is in topic "${record.topic}".` : "";

    emitter.emit("vllora_lucy_prompt", {
      prompt: `I want to generate variants from record ${record.id}.${topicInfo} The record contains: "${preview}". Please ask me how many variants I want to generate and if I have any specific guidance for the variations.`
    });
  }, [record]);

  return (
    <div
      ref={ref}
      onClick={handleClick}
      className={cn(
        "group flex flex-col rounded-md overflow-hidden transition-colors bg-card/30 cursor-pointer hover:bg-muted/50 border-b border-border/20",
        selected && "bg-[rgba(var(--theme-500),0.1)] ring-1 ring-[rgba(var(--theme-500),0.3)]",
        isHighlighted && "animate-record-highlight"
      )}
    >
      {/* Main row */}
      {compact ? (
        /* ─── Compact mode: separate columns (user | assistant | score | tokens) ─── */
        <div className="flex gap-3 px-2 py-2.5 items-start transition-colors">
          {/* Checkbox */}
          {selectable && (
            <SelectionCheckbox
              checked={selected}
              onChange={(checked) => onSelect?.(checked)}
              className={cn(COLUMN_WIDTHS.checkbox, "mt-0.5")}
            />
          )}

          {/* User message column */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-foreground line-clamp-2 leading-relaxed">
              {userText}
            </p>
          </div>

          {/* Assistant message column */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
              {assistantText}
            </p>
          </div>

          {/* Score (right side, like JSONL table) */}
          <QualityIndicator
            evaluation={record.evaluation}
            compact
            onNavigate={handleScoreNavigate}
            className="shrink-0 mt-0.5"
          />

          {/* Tokens */}
          <StatsBadge
            data={record.data}
            className="shrink-0 mt-0.5"
            compact
            assistantFallback={typeof record.metadata?.skillResponse === "string" ? record.metadata.skillResponse : undefined}
          />

          {/* Actions — three-dot menu */}
          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
            <RecordActions
              onEdit={onSave ? () => setEditDialogOpen(true) : undefined}
              onDelete={() => onDelete(record.id)}
              onGenerateVariants={handleGenerateVariants}
              onCopyId={() => {
                navigator.clipboard.writeText(record.id);
              }}
            />
          </div>
        </div>
      ) : (
        /* ─── Default mode: full layout with badges, topic, quality ─── */
        <div className="flex gap-3 px-2 py-1.5 items-center transition-colors">
          {/* Checkbox */}
          {selectable && (
            <SelectionCheckbox
              checked={selected}
              onChange={(checked) => onSelect?.(checked)}
              className={COLUMN_WIDTHS.checkbox}
            />
          )}

          {/* Conversational Thread / Content */}
          <ConversationThreadCell
            data={record.data}
            className={COLUMN_WIDTHS.thread}
            sourceRecordId={record.sourceRecordId}
            hideSystemMessage={hideTopic}
            assistantFallback={typeof record.metadata?.skillResponse === "string" ? record.metadata.skillResponse : undefined}
          />

          {/* AI-generated indicator */}
          {record.is_generated && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))] shrink-0">
              <Sparkles className="w-2.5 h-2.5" />
              AI
            </span>
          )}

          {/* Query origin badge (seed from traces vs synthetic) */}
          {typeof record.metadata?.prompt_type === "string" && (
            <QueryOriginBadge origin={getQueryOrigin(record.metadata.prompt_type)} compact />
          )}

          {/* Source document badge with chunk ref count */}
          {sourceAttributions.length > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 shrink-0 max-w-[140px]">
              <FileText className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{sourceAttributions[0].sourceName.replace(/\.[^.]+$/, '')}</span>
              {sourceAttributions.length > 1 && (
                <span className="text-blue-400/60 ml-0.5 shrink-0">+{sourceAttributions.length - 1}</span>
              )}
              {(record.metadata?.sourceChunkRefs as string[] | undefined)?.length ? (
                <span className="text-blue-400/50 ml-0.5 shrink-0">
                  ({(record.metadata?.sourceChunkRefs as string[]).length})
                </span>
              ) : null}
            </span>
          )}

          {/* Stats (tokens, turns, tools) */}
          <StatsBadge
            data={record.data}
            className={COLUMN_WIDTHS.stats}
            assistantFallback={typeof record.metadata?.skillResponse === "string" ? record.metadata.skillResponse : undefined}
          />

          {/* Strategy (Topic) */}
          {!hideTopic && (
            <div className={cn("flex items-center justify-center", COLUMN_WIDTHS.strategy)}>
              <TopicCell
                topic={record.topic}
                onUpdate={(topic, isNew) => onUpdateTopic(record.id, topic, isNew)}
                tableLayout
                availableTopics={availableTopics}
              />
            </div>
          )}

          {/* Quality score */}
          <QualityIndicator
            evaluation={record.evaluation}
            className={COLUMN_WIDTHS.quality}
            onNavigate={handleScoreNavigate}
          />

          {/* Actions — three-dot menu */}
          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <RecordActions
              onEdit={onSave ? () => setEditDialogOpen(true) : undefined}
              onDelete={() => onDelete(record.id)}
              onGenerateVariants={handleGenerateVariants}
              onCopyId={() => {
                navigator.clipboard.writeText(record.id);
              }}
            />
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {onSave && (
        <RecordDataDialog
          record={editDialogOpen ? record : null}
          onOpenChange={setEditDialogOpen}
          onSave={onSave}
          onUpdateTopic={onUpdateTopic}
          onUpdateEvaluation={onUpdateEvaluation}
          availableTopics={availableTopics}
        />
      )}
    </div>
  );
});
