/**
 * TopicCell
 *
 * Displays and edits a record's topic with color-coded badge.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Tag } from "lucide-react";
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
        "flex items-center gap-2 shrink-0",
        tableLayout ? "w-28 justify-center" : "min-w-[100px]"
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
            className="h-7 w-28 text-xs bg-background"
            placeholder="Enter topic..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
            onClick={handleSave}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleCancel}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : topic ? (
        <button
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full transition-all hover:opacity-80",
            getTopicColor(topic)
          )}
          onClick={handleStartEdit}
          title="Click to edit topic"
        >
          {topic}
        </button>
      ) : (
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors group"
          onClick={handleStartEdit}
          title="Click to add topic"
        >
          <Tag className="w-3 h-3 group-hover:text-[rgb(var(--theme-500))]" />
          <span className="group-hover:text-[rgb(var(--theme-500))]">Add</span>
        </button>
      )}
    </div>
  );
}
