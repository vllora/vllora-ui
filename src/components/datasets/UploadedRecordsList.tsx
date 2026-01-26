/**
 * UploadedRecordsList
 *
 * Virtualized list component for displaying uploaded JSONL records.
 * Supports selection, pagination, and preview of record content.
 */

import { useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useVirtualizer } from "@tanstack/react-virtual";

const ROW_HEIGHT = 56;

// Type for uploaded file records
export interface UploadedRecord {
  id: string;
  messages: unknown[];
  tools?: unknown[];
}

export interface UploadedRecordsListProps {
  records: UploadedRecord[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
}

export function UploadedRecordsList({
  records,
  selectedIds,
  onToggleSelectAll,
  onToggleSelection,
}: UploadedRecordsListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  return (
    <div className="flex-1 border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <Checkbox
          checked={selectedIds.size === records.length && records.length > 0}
          onCheckedChange={onToggleSelectAll}
        />
        <span className="text-sm font-medium flex-1">Record</span>
        <span className="text-sm font-medium w-24 text-right">Messages</span>
        <span className="text-sm font-medium w-24 text-right">Tools</span>
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index];
            const firstMessage = record.messages[0] as { role?: string; content?: string } | undefined;
            const preview = firstMessage?.content
              ? firstMessage.content.slice(0, 60) + (firstMessage.content.length > 60 ? "..." : "")
              : "No content";

            return (
              <div
                key={record.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex items-center gap-3 px-4 border-b border-border hover:bg-muted/20 cursor-pointer transition-colors ${
                  selectedIds.has(record.id) ? "bg-muted/40" : ""
                }`}
                onClick={() => onToggleSelection(record.id)}
              >
                <Checkbox
                  checked={selectedIds.has(record.id)}
                  onCheckedChange={() => onToggleSelection(record.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{preview}</p>
                  <p className="text-xs text-muted-foreground">
                    Row {virtualRow.index + 1}
                  </p>
                </div>
                <div className="w-24 text-right text-sm text-muted-foreground">
                  {record.messages.length}
                </div>
                <div className="w-24 text-right text-sm text-muted-foreground">
                  {record.tools?.length || 0}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
