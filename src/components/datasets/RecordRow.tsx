/**
 * RecordRow
 *
 * Displays a single record row with checkbox, data, topic, evaluation, timestamp, and actions.
 */

import { DatasetRecord } from "@/types/dataset-types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataCell, SourceCell, TopicCell, EvaluationCell, TimestampCell } from "./cells";
import { COLUMN_WIDTHS } from "./table-columns";

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
  /** Callback when expand is clicked */
  onExpand?: (record: DatasetRecord) => void;
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
  onExpand,
}: RecordRowProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-b-0",
        selected && "bg-[rgb(var(--theme-500))]/5",
        record.is_generated && "border-l-2 border-l-emerald-500/50"
      )}
    >
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

      <DataCell
        data={record.data}
        tableLayout={tableLayout}
      />

      {tableLayout && (
        <SourceCell
          spanId={record.spanId}
          isGenerated={record.is_generated}
          tableLayout={tableLayout}
        />
      )}

      <TopicCell
        topic={record.topic}
        topicPath={record.topic_path}
        topicPaths={record.topic_paths}
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

      {/* Action buttons */}
      <div className={cn("flex items-center justify-end gap-1", COLUMN_WIDTHS.actions)}>
        {onExpand && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-[rgb(var(--theme-500))]"
                  onClick={() => onExpand(record)}
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View & edit</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-red-500"
                onClick={() => onDelete(record.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
