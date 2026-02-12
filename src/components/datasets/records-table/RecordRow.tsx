/**
 * RecordRow
 *
 * Displays a single record row as a conversational thread with tools, strategy, stats, and actions.
 * Supports inline expansion to show detailed view.
 */

import { useState, forwardRef, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { DatasetRecord } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { ConversationThreadCell, ToolsBadge, StatsBadge, TopicCell, RecordExpandedDetail, RecordActions, SelectionCheckbox, QualityIndicator } from "./cells";
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

function RecordIdBadge({ recordId }: { recordId: string }) {
  const [copied, setCopied] = useState(false);
  const shortId = recordId.length > 6 ? recordId.slice(0, 6) : recordId;

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(recordId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [recordId]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy ID: ${recordId}`}
      className="w-16 shrink-0 flex items-center gap-1 group/id"
    >
      <span className="font-mono text-[10px] text-zinc-600 group-hover/id:text-zinc-400 transition-colors">
        {shortId}
      </span>
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-400" />
      ) : (
        <Copy className="h-2.5 w-2.5 text-zinc-700 opacity-0 group-hover/id:opacity-100 transition-opacity" />
      )}
    </button>
  );
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
  isExpanded: controlledExpanded,
  onToggleExpand,
  isHighlighted = false,
}, ref) {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Use controlled or internal state
  // When onExpand is provided, we use sidebar mode (no inline expansion)
  const isExpanded = onExpand ? false : (controlledExpanded ?? internalExpanded);
  const handleToggleExpand = onExpand
    ? () => onExpand(record)
    : (onToggleExpand ?? (() => setInternalExpanded(!internalExpanded)));

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
      onClick={handleToggleExpand}
      className={cn(
        "group flex flex-col rounded-md overflow-hidden transition-colors bg-zinc-800/30",
        isExpanded ? "ring-1 ring-zinc-700/50" : "hover:bg-zinc-800/50",
        selected && "bg-[rgba(var(--theme-500),0.1)] ring-1 ring-[rgba(var(--theme-500),0.3)]",
        isHighlighted && "animate-record-highlight"
      )}
    >
      {/* Main row */}
      <div
        className={cn(
          "px-2 py-1.5 flex items-center gap-3 transition-colors",
          isExpanded && "border-b border-zinc-700/50"
        )}
      >
      

        {/* Checkbox */}
        {selectable && (
          <SelectionCheckbox
            checked={selected}
            onChange={(checked) => onSelect?.(checked)}
            className={COLUMN_WIDTHS.checkbox}
          />
        )}

        {/* Record ID */}
        <RecordIdBadge recordId={record.id} />

        {/* Conversational Thread */}
        <ConversationThreadCell
          data={record.data}
          className={COLUMN_WIDTHS.thread}
          sourceRecordId={record.sourceRecordId}
        />

        {/* Tools Badge */}
        <div className={cn("flex items-center justify-center", COLUMN_WIDTHS.tools)}>
          <ToolsBadge data={record.data} />
        </div>

        {/* Strategy (Topic) - hidden in grouped mode */}
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

        {/* Stats */}
        <div className={cn("flex items-center", COLUMN_WIDTHS.stats)}>
          <StatsBadge data={record.data} />
        </div>

        {/* Quality score — click navigates to evaluator/jobs tab */}
        <QualityIndicator
          evaluation={record.evaluation}
          className={COLUMN_WIDTHS.quality}
          onNavigate={handleScoreNavigate}
        />

        {/* Actions - shown on hover */}
        <div className={cn(
          "flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity",
          COLUMN_WIDTHS.deepDiveActions
        )}>
          <RecordActions
            onEdit={onSave ? () => setEditDialogOpen(true) : undefined}
            onDelete={() => onDelete(record.id)}
            onGenerateVariants={handleGenerateVariants}
          />
        </div>
      </div>

      {/* Expanded detail view */}
      {isExpanded && (
        <RecordExpandedDetail
          record={record}
          availableTopics={availableTopics}
        />
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
