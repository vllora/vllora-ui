/**
 * TopicCell
 *
 * Displays and edits a record's topic with color-coded badge.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTopicColor } from "../record-utils";

interface TopicCellProps {
  topic?: string;
  onUpdate: (topic: string) => Promise<void>;
  /** Whether to show the "Topic:" label prefix */
  showLabel?: boolean;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

export function TopicCell({
  topic,
  onUpdate,
  showLabel = false,
  tableLayout = false,
}: TopicCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditingValue(topic || "");
  };

  const handleSave = async () => {
    await onUpdate(editingValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingValue("");
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 shrink-0",
        tableLayout ? "w-24" : "min-w-[100px]"
      )}
    >
      {showLabel && (
        <span className="text-xs text-muted-foreground">Topic:</span>
      )}
      {isEditing ? (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            className="h-6 w-24 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleSave}
          >
            <Check className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleCancel}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : topic ? (
        <button
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded border uppercase tracking-wide",
            getTopicColor(topic)
          )}
          onClick={handleStartEdit}
        >
          {topic}
        </button>
      ) : (
        <button
          className="text-lg text-muted-foreground/50 hover:text-[rgb(var(--theme-500))] transition-colors"
          onClick={handleStartEdit}
          title="Click to add topic"
        >
          —
        </button>
      )}
    </div>
  );
}
