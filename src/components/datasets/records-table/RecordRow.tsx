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
import { DatasetRecord } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { getRecordSourceAttributions } from "@/lib/distri-finetune-tools/steps/shared/source-attribution";
import { ConversationThreadCell, TopicCell, RecordActions, SelectionCheckbox, QualityIndicator, StatsBadge } from "./cells";
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

  const handleClick = onExpand ? () => onExpand(record) : undefined;

  // Handler for QualityIndicator click — navigate to evaluator or jobs tab and highlight record
  const handleScoreNavigate = useCallback((target: "evaluator" | "jobs") => {
    emitter.emit("vllora_switch_tab", { datasetId: record.datasetId, tab: target });
    // After tab switch, highlight the record in the results table
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vllora_highlight_eval_result', {
        detail: { recordId: record.id }
      }));
    }, 300);
  }, [record.datasetId, record.id]);

  // Handler to trigger Lucy for variant generation
  const handleGenerateVariants = useCallback(() => {
    // Extract a brief summary from the record for context
    const data = record.data as { input?: { messages?: Array<{ role: string; content: string }> } } | null;
    const messages = data?.input?.messages || [];
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
      <div className={cn(
        "px-2 py-1.5 flex gap-3 transition-colors",
        compact ? "items-start" : "items-center"
      )}>

        {/* Checkbox */}
        {selectable && (
          <SelectionCheckbox
            checked={selected}
            onChange={(checked) => onSelect?.(checked)}
            className={cn(COLUMN_WIDTHS.checkbox, compact && "mt-0.5")}
          />
        )}

        {/* Score dot (compact mode: leading indicator) */}
        {compact && (
          <QualityIndicator
            evaluation={record.evaluation}
            compact
            onNavigate={handleScoreNavigate}
            className="mt-0.5"
          />
        )}

        {/* Conversational Thread / Content */}
        <ConversationThreadCell
          data={record.data}
          className={COLUMN_WIDTHS.thread}
          sourceRecordId={record.sourceRecordId}
          hideSystemMessage={hideTopic}
          compact={compact}
          assistantFallback={typeof record.metadata?.skillResponse === "string" ? record.metadata.skillResponse : undefined}
        />

        {/* AI-generated indicator (hidden in compact mode — shown at topic level) */}
        {!compact && record.is_generated && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))] shrink-0">
            <Sparkles className="w-2.5 h-2.5" />
            AI
          </span>
        )}

        {/* Source document badge (hidden in compact mode) */}
        {!compact && sourceAttributions.length > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 shrink-0 max-w-[120px]">
            <FileText className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{sourceAttributions[0].sourceName.replace(/\.[^.]+$/, '')}</span>
            {sourceAttributions.length > 1 && (
              <span className="text-blue-400/60 ml-0.5 shrink-0">+{sourceAttributions.length - 1}</span>
            )}
          </span>
        )}

        {/* Stats (tokens, turns, tools) */}
        <StatsBadge
          data={record.data}
          className={compact ? "shrink-0 mt-0.5" : COLUMN_WIDTHS.stats}
          compact={compact}
          assistantFallback={typeof record.metadata?.skillResponse === "string" ? record.metadata.skillResponse : undefined}
        />

        {/* Strategy (Topic) - hidden in grouped/compact mode */}
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

        {/* Quality score — full display in default mode, already shown as dot in compact */}
        {!compact && (
          <QualityIndicator
            evaluation={record.evaluation}
            className={COLUMN_WIDTHS.quality}
            onNavigate={handleScoreNavigate}
          />
        )}

        {/* Actions — three-dot menu (appears on hover) */}
        <div className={cn(
          "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
          compact && "mt-0.5"
        )}>
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
