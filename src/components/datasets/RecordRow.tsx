/**
 * RecordRow
 *
 * Displays a single record row with checkbox, data, topic, evaluation, timestamp, and actions.
 */

import { DatasetRecord } from "@/types/dataset-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataCell, TopicCell, EvaluationCell, TimestampCell } from "./cells";

interface RecordRowProps {
  record: DatasetRecord;
  onUpdateTopic: (recordId: string, topic: string) => Promise<void>;
  onDelete: (recordId: string) => void;
  /** Whether to show the Topic: label prefix (used in list view) */
  showTopicLabel?: boolean;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
  /** Enable selection checkbox */
  selectable?: boolean;
  /** Whether this row is selected */
  selected?: boolean;
  /** Selection change handler */
  onSelect?: (checked: boolean) => void;
}

export function RecordRow({
  record,
  onUpdateTopic,
  onDelete,
  showTopicLabel = false,
  tableLayout = false,
  selectable = false,
  selected = false,
  onSelect,
}: RecordRowProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 flex items-start gap-4 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-b-0",
        tableLayout && "gap-4",
        selected && "bg-[rgb(var(--theme-500))]/5"
      )}
    >
      {selectable && (
        <div className="w-6 shrink-0 pt-1">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect?.(checked === true)}
            className="border-muted-foreground/30"
          />
        </div>
      )}

      <DataCell data={record.data} tableLayout={tableLayout} />

      <TopicCell
        topic={record.topic}
        onUpdate={(topic) => onUpdateTopic(record.id, topic)}
        showLabel={showTopicLabel}
        tableLayout={tableLayout}
      />

      <EvaluationCell
        evaluation={record.evaluation}
        tableLayout={tableLayout}
      />

      {tableLayout && (
        <TimestampCell
          timestamp={record.createdAt}
          tableLayout={tableLayout}
        />
      )}

      {/* Delete button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-red-500 shrink-0"
        onClick={() => onDelete(record.id)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
