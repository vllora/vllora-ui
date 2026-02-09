/**
 * RecordRow
 *
 * Displays a single record row as a conversational thread with tools, strategy, stats, and actions.
 * Supports inline expansion to show detailed view.
 */

import { useState, forwardRef, useCallback } from "react";
import { DatasetRecord } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { ConversationThreadCell, ToolsBadge, StatsBadge, TopicCell, RecordExpandedDetail, RecordActions, SelectionCheckbox } from "./cells";
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
        "flex flex-col rounded-md overflow-hidden transition-colors bg-zinc-800/30",
        isExpanded ? "ring-1 ring-zinc-700/50" : "hover:bg-zinc-800/50",
        selected && "bg-[rgb(var(--theme-500))]/10 ring-1 ring-[rgb(var(--theme-500))]/30"
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

        {/* Conversational Thread */}
        <ConversationThreadCell
          data={record.data}
          className={COLUMN_WIDTHS.thread}
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

        {/* Actions */}
        <div className={cn("flex items-center justify-center", COLUMN_WIDTHS.deepDiveActions)}>
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
