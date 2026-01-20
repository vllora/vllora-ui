/**
 * RecordRow
 *
 * Displays a single record row as a conversational thread with tools, strategy, stats, and actions.
 * Supports inline expansion to show detailed view.
 */

import { useState, forwardRef } from "react";
import { DatasetRecord } from "@/types/dataset-types";
import { Check, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationThreadCell, ToolsBadge, StatsBadge, TopicCell, RecordExpandedDetail, RecordActions } from "./cells";
import { RecordDataDialog } from "./RecordDataDialog";
import { COLUMN_WIDTHS } from "./table-columns";
import type { AvailableTopic } from "./record-utils";

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
  availableTopics = [],
  hideTopic = false,
  isExpanded: controlledExpanded,
  onToggleExpand,
}, ref) {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Use controlled or internal state
  const isExpanded = controlledExpanded ?? internalExpanded;
  const handleToggleExpand = onToggleExpand ?? (() => setInternalExpanded(!internalExpanded));

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col rounded-lg border border-border/40 bg-card/30 overflow-hidden",
        isExpanded && "border-border/60 shadow-md"
      )}
    >
      {/* Main row */}
      <div
        className={cn(
          "px-4 py-4 flex items-center gap-4 transition-colors",
          !isExpanded && "hover:bg-muted/30",
          selected && "bg-[rgb(var(--theme-500))]/5",
          isExpanded && "bg-zinc-800/50"
        )}
      >
        {/* Expand/Collapse toggle */}
        <button
          onClick={handleToggleExpand}
          className="w-6 h-6 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Checkbox */}
        {selectable && (
          <div
            className={cn("flex items-center justify-center", COLUMN_WIDTHS.checkbox)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(!selected);
            }}
          >
            <div
              className={cn(
                "h-4 w-4 rounded flex items-center justify-center cursor-pointer transition-all duration-150",
                "border",
                selected
                  ? "bg-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]"
                  : "bg-transparent border-muted-foreground/50 hover:border-muted-foreground"
              )}
            >
              {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
          </div>
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
